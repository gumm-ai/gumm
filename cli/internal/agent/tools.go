package agent

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

type ToolExecutor struct {
	uploader FileUploader
}

// FileUploader allows the tool executor to upload files to the backend.
type FileUploader interface {
	UploadFile(localPath string) (storageKey string, err error)
}

func NewToolExecutor() *ToolExecutor {
	return &ToolExecutor{}
}

// SetUploader configures the file upload capability (requires a connected client).
func (t *ToolExecutor) SetUploader(u FileUploader) {
	t.uploader = u
}

func (t *ToolExecutor) Run(name string, args map[string]any) string {
	switch name {
	case "open_url":
		return t.openURL(getString(args, "url"), getString(args, "browser"))
	case "open_application":
		return t.openApp(getString(args, "name"))
	case "run_shell_command":
		return t.runShell(getString(args, "command"), getString(args, "working_directory"))
	case "take_screenshot":
		return t.screenshot()
	case "get_browser_dom":
		return t.getBrowserDOM(getString(args, "browser"))
	case "get_browser_url":
		return t.getBrowserURL()
	case "read_file":
		return t.readFile(getString(args, "path"))
	case "write_file":
		return t.writeFile(getString(args, "path"), getString(args, "content"))
	case "list_directory":
		p := getString(args, "path")
		if p == "" {
			p = "."
		}
		return t.listDir(p)
	case "upload_file":
		return t.uploadFile(getString(args, "path"))
	case "click_at":
		return t.clickAt(getInt(args, "x"), getInt(args, "y"), getString(args, "button"))
	case "double_click_at":
		return t.doubleClickAt(getInt(args, "x"), getInt(args, "y"))
	case "type_text":
		return t.typeText(getString(args, "text"))
	case "press_key":
		return t.pressKey(getString(args, "key"), getStringSlice(args, "modifiers"))
	case "press_media_key":
		return t.pressMediaKey(getString(args, "key"))
	case "click_browser_element":
		return t.clickBrowserElement(getInt(args, "id"), getString(args, "browser"))
	case "type_in_browser":
		return t.typeInBrowser(getInt(args, "id"), getString(args, "text"), getString(args, "browser"))
	case "scroll_browser":
		return t.scrollBrowser(getString(args, "direction"), getInt(args, "amount"), getString(args, "browser"))
	case "detect_browsers":
		return t.detectBrowsersTool()
	default:
		return jsonErr("unknown tool: " + name)
	}
}

func (t *ToolExecutor) openURL(url, browser string) string {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		if browser != "" {
			// Resolve to macOS app name (e.g. "Brave" → "Brave Browser")
			appName := resolveAppName(browser)
			if appName == "" {
				appName = browser
			}
			cmd = exec.Command("open", "-a", appName, url)
		} else {
			cmd = exec.Command("open", url)
		}
	case "linux":
		if browser != "" {
			cmd = exec.Command(browser, url)
		} else {
			cmd = exec.Command("xdg-open", url)
		}
	default:
		cmd = exec.Command("cmd", "/c", "start", url)
	}
	if err := cmd.Start(); err != nil {
		return jsonErr(fmt.Sprintf("failed to open URL: %s", err))
	}
	// Wait briefly so the browser tab has time to start loading
	time.Sleep(2 * time.Second)
	res := map[string]any{"status": "opened", "url": url}
	if browser != "" {
		res["browser"] = browser
	}
	res["note"] = "Page is loading. Wait 2-3 seconds before calling get_browser_dom to ensure the page is fully loaded."
	return jsonResult(res)
}

// detectBrowsersTool returns the list of browsers installed on this machine
// and which one is the system default. Helps the LLM pick the right browser.
func (t *ToolExecutor) detectBrowsersTool() string {
	installed := detectInstalledBrowsers()
	if len(installed) == 0 {
		return jsonResult(map[string]any{"installed": []string{}, "note": "Could not detect installed browsers"})
	}

	compatible := filterChromiumBrowsers(installed)
	var recommended string
	if len(compatible) > 0 {
		recommended = compatible[0]
	}

	// Detect default browser on macOS
	var defaultBrowser string
	if runtime.GOOS == "darwin" {
		out, err := exec.Command("defaults", "read",
			"com.apple.LaunchServices/com.apple.launchservices.secure",
			"LSHandlers").CombinedOutput()
		outStr := string(out)
		if err == nil {
			// Try to detect from the HTTP handler
			for _, b := range []struct{ id, name string }{
				{"com.google.chrome", "Google Chrome"},
				{"com.brave.browser", "Brave"},
				{"company.thebrowser.browser", "Arc"},
				{"com.microsoft.edgemac", "Microsoft Edge"},
				{"org.mozilla.firefox", "Firefox"},
				{"com.apple.safari", "Safari"},
			} {
				if strings.Contains(strings.ToLower(outStr), b.id) {
					defaultBrowser = b.name
					break
				}
			}
		}
	}

	result := map[string]any{
		"installed":       installed,
		"compatible":      compatible,
		"recommended":     recommended,
		"firefox_warning": containsStr(installed, "Firefox"),
	}
	if defaultBrowser != "" {
		result["default_browser"] = defaultBrowser
	}
	return jsonResult(result)
}

func containsStr(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

func (t *ToolExecutor) openApp(name string) string {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", "-a", name)
	case "linux":
		cmd = exec.Command("xdg-open", name)
	default:
		return jsonErr("unsupported platform for open_application")
	}
	if err := cmd.Start(); err != nil {
		return jsonErr(err.Error())
	}
	return jsonResult(map[string]any{"status": "opened", "app": name})
}

func (t *ToolExecutor) runShell(command, workDir string) string {
	cmd := exec.Command("sh", "-c", command)
	if workDir != "" {
		cmd.Dir = workDir
	}

	out, err := cmd.CombinedOutput()
	output := string(out)
	if len(output) > 10000 {
		output = output[:10000] + "\n... (truncated)"
	}

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			return jsonErr(err.Error())
		}
	}

	return jsonResult(map[string]any{
		"output":     output,
		"returncode": exitCode,
	})
}

func (t *ToolExecutor) screenshot() string {
	path := filepath.Join(os.TempDir(), "gumm_screenshot.png")
	switch runtime.GOOS {
	case "darwin":
		if err := exec.Command("screencapture", "-x", path).Run(); err != nil {
			return jsonErr(err.Error())
		}
		// Resize to logical screen resolution so pixel coordinates in the image
		// match CGEvent point coordinates. On Retina displays, screencapture
		// produces 2x resolution images which causes the LLM to estimate
		// coordinates that are 2x off from the actual click targets.
		t.resizeScreenshotToLogical(path)
	case "linux":
		if err := exec.Command("import", "-window", "root", path).Run(); err != nil {
			return jsonErr(err.Error())
		}
	default:
		return jsonErr("screenshot not supported on this platform")
	}
	// Encode the image as base64 so it can be fed back to the LLM as vision context.
	data, err := os.ReadFile(path)
	if err != nil {
		return jsonResult(map[string]any{"status": "captured", "path": path})
	}
	b64 := base64.StdEncoding.EncodeToString(data)
	return jsonResult(map[string]any{
		"status":       "captured",
		"path":         path,
		"image_base64": b64,
	})
}

// getBrowserDOM extracts interactive elements from the active browser tab on macOS.
// Returns a structured JSON list of clickable/typeable elements with IDs that can
// be used with click_browser_element and type_in_browser for reliable automation.
// Supports Chromium-family browsers and Safari. Firefox is detected with a fallback message.
func (t *ToolExecutor) getBrowserDOM(browser string) string {
	if runtime.GOOS != "darwin" {
		return jsonErr("get_browser_dom is only supported on macOS")
	}

	// JavaScript that finds all interactive elements, tags them with data-gumm-id,
	// and returns a compact structured list. No raw HTML dump.
	jsCode := `(function(){
var D=document,W=window,A='data-gumm-id';
D.querySelectorAll('['+A+']').forEach(function(e){e.removeAttribute(A)});
var r=[],id=0,seen=new Set();
var sels='a[href],button,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="option"],[role="textbox"],[role="combobox"],[contenteditable="true"],[tabindex]:not([tabindex="-1"]),summary';
var els=D.querySelectorAll(sels);
for(var i=0;i<els.length&&id<200;i++){
var e=els[i];if(seen.has(e))continue;seen.add(e);
var b=e.getBoundingClientRect();
if(b.width<5||b.height<5||b.bottom<0||b.right<0||b.top>W.innerHeight||b.left>W.innerWidth)continue;
var cs=W.getComputedStyle(e);
if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.1)continue;
var txt;if(e.tagName==='INPUT'||e.tagName==='TEXTAREA'){txt=e.placeholder||e.value||'';}
else{txt=(e.innerText||'').trim();}
txt=txt.replace(/\s+/g,' ').substring(0,80);
if(!txt&&!e.getAttribute('aria-label')&&!e.id&&!e.getAttribute('placeholder'))continue;
var o={id:id,tag:e.tagName.toLowerCase()};
if(txt)o.text=txt;if(e.id)o.htmlId=e.id;
var al=e.getAttribute('aria-label');if(al)o.label=al;
var ph=e.getAttribute('placeholder');if(ph)o.ph=ph;
if(e.href)o.href=e.href.substring(0,150);
if(e.type&&e.type!=='hidden')o.type=e.type;
var rl=e.getAttribute('role');if(rl)o.role=rl;
if(e.getAttribute('contenteditable')==='true')o.editable=true;
e.setAttribute(A,String(id));r.push(o);id++;
}
return JSON.stringify({url:location.href,title:D.title,scroll:Math.round(W.scrollY),viewport:{w:W.innerWidth,h:W.innerHeight},pageH:D.documentElement.scrollHeight,count:r.length,elements:r});
})()`

	tmpFile := filepath.Join(os.TempDir(), "gumm_browser.js")
	if err := os.WriteFile(tmpFile, []byte(jsCode), 0644); err != nil {
		return jsonErr("failed to write temp JS: " + err.Error())
	}
	defer os.Remove(tmpFile)

	result, err := t.execBrowserJS(tmpFile, browser)
	if err != nil {
		return jsonErr(err.Error() + ". Hint: The page may still be loading. Wait 3 seconds and retry get_browser_dom. Make sure you pass the correct browser parameter (e.g. browser='Brave Browser').")
	}

	// Parse the JSON result for clean structured output
	var structured map[string]any
	if err := json.Unmarshal([]byte(result), &structured); err == nil {
		structured["status"] = "ok"
		return jsonResult(structured)
	}

	// Fallback: return as raw string (shouldn't normally happen)
	if len(result) > 60000 {
		result = result[:60000] + "\n... (truncated)"
	}
	return jsonResult(map[string]any{
		"status": "ok",
		"html":   result,
		"length": len(result),
		"note":   "Could not extract structured DOM, returning raw HTML",
	})
}

// getBrowserURL returns the URL of the active tab in the frontmost browser on macOS.
func (t *ToolExecutor) getBrowserURL() string {
	if runtime.GOOS != "darwin" {
		return jsonErr("get_browser_url is only supported on macOS")
	}

	// Only check browsers that are actually running to avoid launching unwanted apps.
	script := `
set pageURL to ""
repeat with b in {"Google Chrome", "Chromium", "Arc", "Brave Browser", "Microsoft Edge"}
    tell application "System Events"
        set isRunning to (exists (processes whose name is b))
    end tell
    if isRunning then
        try
            tell application b
                set pageURL to URL of front window's active tab
            end tell
            exit repeat
        end try
    end if
end repeat
if pageURL is "" then
    tell application "System Events"
        set safariRunning to (exists (processes whose name is "Safari"))
    end tell
    if safariRunning then
        try
            tell application "Safari" to set pageURL to URL of document 1
        end try
    end if
end if
return pageURL`

	out, err := exec.Command("osascript", "-e", script).CombinedOutput()
	if err != nil {
		return jsonErr(fmt.Sprintf("get_browser_url failed: %s — %s", err, strings.TrimSpace(string(out))))
	}

	url := strings.TrimSpace(string(out))
	return jsonResult(map[string]any{
		"status": "ok",
		"url":    url,
	})
}

// execBrowserJS writes JS to a temp file and executes it in the active browser tab via AppleScript.
// Supports Chromium-family browsers (Chrome, Arc, Brave, Edge) and Safari.
// Returns the JS evaluation result as a string.
func (t *ToolExecutor) execBrowserJS(jsFilePath, browser string) (string, error) {
	if strings.ToLower(browser) == "firefox" {
		return "", fmt.Errorf("Firefox does not support JavaScript execution via automation. Use a Chromium-based browser (Chrome, Brave, Arc, Edge) or Safari for full web automation. For Firefox, fall back to take_screenshot + click_at")
	}

	// Map user-friendly browser names to their exact macOS app names for AppleScript.
	appName := resolveAppName(browser)

	var script string
	if appName != "" {
		// Target a SPECIFIC browser — do NOT loop through others.
		if strings.ToLower(appName) == "safari" {
			script = fmt.Sprintf(`set jsCode to read POSIX file %q
tell application "Safari" to do JavaScript jsCode in document 1`, jsFilePath)
		} else {
			script = fmt.Sprintf(`set jsCode to read POSIX file %q
tell application %q
    set jsResult to execute front window's active tab javascript jsCode
end tell
return jsResult`, jsFilePath, appName)
		}
	} else {
		// Auto-detect: try ONLY browsers that are already running to avoid launching unwanted apps.
		script = fmt.Sprintf(`set jsCode to read POSIX file %q
set jsResult to ""
repeat with b in {"Google Chrome", "Chromium", "Arc", "Brave Browser", "Microsoft Edge"}
    tell application "System Events"
        set isRunning to (exists (processes whose name is b))
    end tell
    if isRunning then
        try
            tell application b
                set jsResult to execute front window's active tab javascript jsCode
            end tell
            exit repeat
        end try
    end if
end repeat
if jsResult is "" then
    tell application "System Events"
        set safariRunning to (exists (processes whose name is "Safari"))
    end tell
    if safariRunning then
        try
            tell application "Safari" to set jsResult to do JavaScript jsCode in document 1
        end try
    end if
end if
if jsResult is "" then
    set frontApp to ""
    try
        tell application "System Events" to set frontApp to name of first application process whose frontmost is true
    end try
    if frontApp contains "irefox" then
        error "FIREFOX_DETECTED"
    end if
    error "NO_BROWSER_FOUND"
end if
return jsResult`, jsFilePath)
	}

	out, err := exec.Command("osascript", "-e", script).CombinedOutput()
	if err != nil {
		errStr := strings.TrimSpace(string(out))
		if strings.Contains(errStr, "FIREFOX_DETECTED") {
			installed := detectInstalledBrowsers()
			chromiumOptions := filterChromiumBrowsers(installed)
			if len(chromiumOptions) > 0 {
				return "", fmt.Errorf(
					"Firefox is the active browser but doesn't support web automation. "+
						"Detected compatible browsers on this machine: %s. "+
						"Please ask the user to open the page in one of these browsers instead (recommend %s). "+
						"Save their preference with memory_remember(key: 'preferred_browser', value: '<browser>') so you don't have to ask again",
					strings.Join(chromiumOptions, ", "), chromiumOptions[0])
			}
			return "", fmt.Errorf(
				"Firefox is the active browser but doesn't support web automation. " +
					"No Chromium-based browser detected on this machine. " +
					"The user should install Chrome, Brave, Arc, or Edge for full browser automation. " +
					"For now, fall back to take_screenshot + click_at (less reliable)")
		}
		if strings.Contains(errStr, "NO_BROWSER_FOUND") {
			installed := detectInstalledBrowsers()
			if len(installed) > 0 {
				return "", fmt.Errorf("No browser tab is currently open. Detected browsers: %s. Open a URL first with open_url", strings.Join(installed, ", "))
			}
			return "", fmt.Errorf("No supported browser found or no page is open. Supported: Chrome, Arc, Brave, Edge, Safari")
		}
		return "", fmt.Errorf("%s — %s", err, errStr)
	}
	return strings.TrimSpace(string(out)), nil
}

// resolveAppName maps user-friendly browser names (case-insensitive) to their exact macOS app names.
// Returns empty string if the input is empty or "auto" (meaning auto-detect).
func resolveAppName(browser string) string {
	switch strings.ToLower(strings.TrimSpace(browser)) {
	case "", "auto":
		return ""
	case "brave", "brave browser":
		return "Brave Browser"
	case "chrome", "google chrome":
		return "Google Chrome"
	case "arc":
		return "Arc"
	case "edge", "microsoft edge":
		return "Microsoft Edge"
	case "chromium":
		return "Chromium"
	case "safari":
		return "Safari"
	case "firefox":
		return "Firefox"
	default:
		// If user passes something like "Brave Browser" directly, return as-is
		return browser
	}
}

// detectInstalledBrowsers checks which browsers are installed on macOS.
func detectInstalledBrowsers() []string {
	if runtime.GOOS != "darwin" {
		return nil
	}
	browsers := []struct {
		name    string
		appName string
	}{
		{"Google Chrome", "Google Chrome"},
		{"Brave", "Brave Browser"},
		{"Arc", "Arc"},
		{"Microsoft Edge", "Microsoft Edge"},
		{"Safari", "Safari"},
		{"Firefox", "Firefox"},
	}
	var found []string
	for _, b := range browsers {
		// Check if the app exists using mdfind (Spotlight)
		out, err := exec.Command("mdfind", "kMDItemFSName == '"+b.appName+".app'").Output()
		if err == nil && len(strings.TrimSpace(string(out))) > 0 {
			found = append(found, b.name)
		}
	}
	return found
}

// filterChromiumBrowsers returns only Chromium-based + Safari browsers from the list.
func filterChromiumBrowsers(browsers []string) []string {
	compatible := map[string]bool{
		"Google Chrome": true, "Brave": true, "Arc": true,
		"Microsoft Edge": true, "Safari": true,
	}
	var result []string
	for _, b := range browsers {
		if compatible[b] {
			result = append(result, b)
		}
	}
	return result
}

// clickBrowserElement clicks an element identified by its data-gumm-id attribute.
// The element must have been indexed by a prior call to get_browser_dom.
func (t *ToolExecutor) clickBrowserElement(id int, browser string) string {
	if runtime.GOOS != "darwin" {
		return jsonErr("click_browser_element is only supported on macOS")
	}

	jsCode := fmt.Sprintf(`(function(){
var el=document.querySelector('[data-gumm-id="%d"]');
if(!el)return JSON.stringify({error:'Element not found. Run get_browser_dom first to index elements.'});
el.scrollIntoView({block:'center',behavior:'instant'});
el.focus();
el.click();
var t=(el.innerText||el.textContent||'').trim().substring(0,80);
return JSON.stringify({status:'clicked',tag:el.tagName.toLowerCase(),text:t,id:%d});
})()`, id, id)

	tmpFile := filepath.Join(os.TempDir(), "gumm_browser.js")
	if err := os.WriteFile(tmpFile, []byte(jsCode), 0644); err != nil {
		return jsonErr("failed to write temp JS: " + err.Error())
	}
	defer os.Remove(tmpFile)

	result, err := t.execBrowserJS(tmpFile, browser)
	if err != nil {
		return jsonErr(err.Error())
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(result), &parsed); err == nil {
		return jsonResult(parsed)
	}
	return jsonResult(map[string]any{"status": "ok", "result": result})
}

// typeInBrowser types text into a browser element identified by its data-gumm-id.
// For input/textarea: sets the value and dispatches input events.
// For contenteditable elements: uses execCommand insertText for React/framework compatibility.
func (t *ToolExecutor) typeInBrowser(id int, text, browser string) string {
	if runtime.GOOS != "darwin" {
		return jsonErr("type_in_browser is only supported on macOS")
	}

	textJSON, _ := json.Marshal(text)
	jsCode := fmt.Sprintf(`(function(){
var el=document.querySelector('[data-gumm-id="%d"]');
if(!el)return JSON.stringify({error:'Element not found. Run get_browser_dom first.'});
el.scrollIntoView({block:'center',behavior:'instant'});
el.focus();
var text=%s;
var tag=el.tagName;
if(tag==='INPUT'||tag==='TEXTAREA'){
el.value=text;
el.dispatchEvent(new Event('input',{bubbles:true}));
el.dispatchEvent(new Event('change',{bubbles:true}));
}else{
document.execCommand('selectAll',false,null);
document.execCommand('insertText',false,text);
}
return JSON.stringify({status:'typed',tag:tag.toLowerCase(),id:%d});
})()`, id, string(textJSON), id)

	tmpFile := filepath.Join(os.TempDir(), "gumm_browser.js")
	if err := os.WriteFile(tmpFile, []byte(jsCode), 0644); err != nil {
		return jsonErr("failed to write temp JS: " + err.Error())
	}
	defer os.Remove(tmpFile)

	result, err := t.execBrowserJS(tmpFile, browser)
	if err != nil {
		return jsonErr(err.Error())
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(result), &parsed); err == nil {
		return jsonResult(parsed)
	}
	return jsonResult(map[string]any{"status": "ok", "result": result})
}

// scrollBrowser scrolls the active browser page up or down.
func (t *ToolExecutor) scrollBrowser(direction string, amount int, browser string) string {
	if runtime.GOOS != "darwin" {
		return jsonErr("scroll_browser is only supported on macOS")
	}

	if amount <= 0 {
		amount = 500
	}
	pixels := amount
	if direction == "up" {
		pixels = -pixels
	}

	jsCode := fmt.Sprintf(`(function(){
window.scrollBy({top:%d,behavior:'instant'});
return JSON.stringify({status:'scrolled',scrollY:Math.round(window.scrollY),pageHeight:document.documentElement.scrollHeight,viewportHeight:window.innerHeight});
})()`, pixels)

	tmpFile := filepath.Join(os.TempDir(), "gumm_browser.js")
	if err := os.WriteFile(tmpFile, []byte(jsCode), 0644); err != nil {
		return jsonErr("failed to write temp JS: " + err.Error())
	}
	defer os.Remove(tmpFile)

	result, err := t.execBrowserJS(tmpFile, browser)
	if err != nil {
		return jsonErr(err.Error())
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(result), &parsed); err == nil {
		return jsonResult(parsed)
	}
	return jsonResult(map[string]any{"status": "ok", "result": result})
}

// resizeScreenshotToLogical resizes a screenshot to match the logical screen resolution.
// On Retina/HiDPI displays, screencapture produces 2x (or 3x) resolution images,
// but CGEvent coordinates use logical (1x) resolution. Without resizing, the LLM's
// coordinate estimates from the screenshot would be off by the scale factor.
// Handles multi-monitor and ultra-wide setups by computing the full virtual screen bounds.
func (t *ToolExecutor) resizeScreenshotToLogical(path string) {
	// Compute total logical width across ALL connected displays.
	// This handles multi-monitor/ultra-wide setups correctly.
	// screencapture stitches all displays, so we need the total virtual width.
	pyScript := `
import Quartz
err, ids, cnt = Quartz.CGGetActiveDisplayList(32, None, None)
min_x, max_x = float('inf'), float('-inf')
for d in ids:
    b = Quartz.CGDisplayBounds(d)
    min_x = min(min_x, b.origin.x)
    max_x = max(max_x, b.origin.x + b.size.width)
print(int(max_x - min_x))
`
	out, err := exec.Command("python3", "-c", pyScript).Output()
	if err != nil {
		return
	}
	logicalWidth := strings.TrimSpace(string(out))
	if logicalWidth == "" || logicalWidth == "0" {
		return
	}

	// Get the screenshot's actual pixel width
	sipsOut, err := exec.Command("sips", "-g", "pixelWidth", path).Output()
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(sipsOut), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "pixelWidth:") {
			imgWidth := strings.TrimSpace(strings.TrimPrefix(line, "pixelWidth:"))
			logW, _ := strconv.Atoi(logicalWidth)
			imgW, _ := strconv.Atoi(imgWidth)
			// Only resize if the image is significantly larger than logical (HiDPI)
			if logW > 0 && imgW > logW+100 {
				_ = exec.Command("sips", "--resampleWidth", logicalWidth, path).Run()
			}
			break
		}
	}
}

func (t *ToolExecutor) readFile(path string) string {
	if path == "" {
		return jsonErr("path is required")
	}
	absPath, _ := filepath.Abs(path)
	data, err := os.ReadFile(absPath)
	if err != nil {
		return jsonErr(err.Error())
	}
	content := string(data)
	if len(content) > 15000 {
		content = content[:15000] + "\n... (truncated)"
	}
	return jsonResult(map[string]any{"path": absPath, "content": content})
}

func (t *ToolExecutor) writeFile(path, content string) string {
	if path == "" {
		return jsonErr("path is required")
	}
	absPath, _ := filepath.Abs(path)
	dir := filepath.Dir(absPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return jsonErr(err.Error())
	}
	if err := os.WriteFile(absPath, []byte(content), 0644); err != nil {
		return jsonErr(err.Error())
	}
	return jsonResult(map[string]any{"status": "written", "path": absPath, "bytes": len(content)})
}

func (t *ToolExecutor) uploadFile(path string) string {
	if path == "" {
		return jsonErr("path is required")
	}
	absPath, _ := filepath.Abs(path)
	if _, err := os.Stat(absPath); os.IsNotExist(err) {
		return jsonErr("file not found: " + absPath)
	}
	if t.uploader == nil {
		return jsonErr("file upload not available — no server connection")
	}
	storageKey, err := t.uploader.UploadFile(absPath)
	if err != nil {
		return jsonErr("upload failed: " + err.Error())
	}
	return jsonResult(map[string]any{
		"status":     "uploaded",
		"path":       absPath,
		"storageKey": storageKey,
	})
}

func (t *ToolExecutor) listDir(path string) string {
	absPath, _ := filepath.Abs(path)
	entries, err := os.ReadDir(absPath)
	if err != nil {
		return jsonErr(err.Error())
	}

	type entry struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	var result []entry
	for i, e := range entries {
		if i >= 200 {
			break
		}
		t := "file"
		if e.IsDir() {
			t = "dir"
		}
		result = append(result, entry{Name: e.Name(), Type: t})
	}
	sort.Slice(result, func(i, j int) bool {
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return jsonResult(map[string]any{"path": absPath, "entries": result})
}

// ─── Screen Interaction Tools ─────────────────────────────────────────────

func (t *ToolExecutor) clickAt(x, y int, button string) string {
	if button == "" {
		button = "left"
	}
	switch runtime.GOOS {
	case "darwin":
		return t.clickAtDarwin(x, y, button)
	default:
		return jsonErr("click_at not supported on " + runtime.GOOS)
	}
}

func (t *ToolExecutor) clickAtDarwin(x, y int, button string) string {
	// Map button to AppleScript/CGEvent representation
	var script string
	switch button {
	case "right":
		script = fmt.Sprintf(`
do shell script "python3 -c '
import Quartz, time
pt = Quartz.CGPointMake(%d, %d)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventRightMouseDown, pt, Quartz.kCGMouseButtonRight))
time.sleep(0.05)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventRightMouseUp, pt, Quartz.kCGMouseButtonRight))
'"`, x, y)
	default: // left
		script = fmt.Sprintf(`
do shell script "python3 -c '
import Quartz, time
pt = Quartz.CGPointMake(%d, %d)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, pt, Quartz.kCGMouseButtonLeft))
time.sleep(0.05)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, pt, Quartz.kCGMouseButtonLeft))
'"`, x, y)
	}
	out, err := exec.Command("osascript", "-e", script).CombinedOutput()
	if err != nil {
		return jsonErr(fmt.Sprintf("click failed: %s — %s", err, string(out)))
	}
	return jsonResult(map[string]any{"status": "clicked", "x": x, "y": y, "button": button})
}

func (t *ToolExecutor) doubleClickAt(x, y int) string {
	switch runtime.GOOS {
	case "darwin":
		script := fmt.Sprintf(`
do shell script "python3 -c '
import Quartz, time
pt = Quartz.CGPointMake(%d, %d)
for _ in range(2):
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, pt, Quartz.kCGMouseButtonLeft))
    time.sleep(0.03)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, pt, Quartz.kCGMouseButtonLeft))
    time.sleep(0.05)
'"`, x, y)
		out, err := exec.Command("osascript", "-e", script).CombinedOutput()
		if err != nil {
			return jsonErr(fmt.Sprintf("double click failed: %s — %s", err, string(out)))
		}
		return jsonResult(map[string]any{"status": "double_clicked", "x": x, "y": y})
	default:
		return jsonErr("double_click_at not supported on " + runtime.GOOS)
	}
}

func (t *ToolExecutor) typeText(text string) string {
	switch runtime.GOOS {
	case "darwin":
		// Use AppleScript keystroke for reliable text input
		script := fmt.Sprintf(`tell application "System Events" to keystroke %q`, text)
		out, err := exec.Command("osascript", "-e", script).CombinedOutput()
		if err != nil {
			return jsonErr(fmt.Sprintf("type_text failed: %s — %s", err, string(out)))
		}
		return jsonResult(map[string]any{"status": "typed", "length": len(text)})
	default:
		return jsonErr("type_text not supported on " + runtime.GOOS)
	}
}

func (t *ToolExecutor) pressKey(key string, modifiers []string) string {
	switch runtime.GOOS {
	case "darwin":
		return t.pressKeyDarwin(key, modifiers)
	default:
		return jsonErr("press_key not supported on " + runtime.GOOS)
	}
}

func (t *ToolExecutor) pressKeyDarwin(key string, modifiers []string) string {
	// Map key names to AppleScript key code equivalents
	keyCodeMap := map[string]int{
		"return": 36, "enter": 36, "tab": 48, "space": 49,
		"delete": 51, "backspace": 51, "escape": 53, "esc": 53,
		"up": 126, "down": 125, "left": 123, "right": 124,
		"f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96,
		"f6": 97, "f7": 98, "f8": 100, "f9": 101, "f10": 109,
		"f11": 103, "f12": 111,
		"home": 115, "end": 119, "pageup": 116, "pagedown": 121,
	}

	// Build modifier string for AppleScript
	var modParts []string
	for _, mod := range modifiers {
		switch strings.ToLower(mod) {
		case "command", "cmd":
			modParts = append(modParts, "command down")
		case "shift":
			modParts = append(modParts, "shift down")
		case "option", "alt":
			modParts = append(modParts, "option down")
		case "control", "ctrl":
			modParts = append(modParts, "control down")
		}
	}

	modStr := ""
	if len(modParts) > 0 {
		modStr = " using {" + strings.Join(modParts, ", ") + "}"
	}

	var script string
	if code, ok := keyCodeMap[strings.ToLower(key)]; ok {
		script = fmt.Sprintf(`tell application "System Events" to key code %d%s`, code, modStr)
	} else if len(key) == 1 {
		// Single character — use keystroke
		script = fmt.Sprintf(`tell application "System Events" to keystroke %q%s`, key, modStr)
	} else {
		return jsonErr("unknown key: " + key)
	}

	out, err := exec.Command("osascript", "-e", script).CombinedOutput()
	if err != nil {
		return jsonErr(fmt.Sprintf("press_key failed: %s — %s", err, string(out)))
	}
	return jsonResult(map[string]any{"status": "pressed", "key": key, "modifiers": modifiers})
}

func (t *ToolExecutor) pressMediaKey(key string) string {
	switch runtime.GOOS {
	case "darwin":
		return t.pressMediaKeyDarwin(key)
	default:
		return jsonErr("press_media_key not supported on " + runtime.GOOS)
	}
}

func (t *ToolExecutor) pressMediaKeyDarwin(key string) string {
	// NX_KEYTYPE values for media keys
	// These are used with CGEventCreateKeyboardEvent via the IOKit HID system
	keyTypeMap := map[string]int{
		"play_pause":  16, // NX_KEYTYPE_PLAY
		"next":        17, // NX_KEYTYPE_NEXT
		"previous":    18, // NX_KEYTYPE_PREVIOUS (rewind)
		"volume_up":   0,  // NX_KEYTYPE_SOUND_UP
		"volume_down": 1,  // NX_KEYTYPE_SOUND_DOWN
		"mute":        7,  // NX_KEYTYPE_MUTE
	}

	keyType, ok := keyTypeMap[strings.ToLower(key)]
	if !ok {
		return jsonErr("unknown media key: " + key + ". Valid keys: play_pause, next, previous, volume_up, volume_down, mute")
	}

	// Use Python + Quartz to post NX system-defined media key events
	// This simulates hardware media keys — works with any app (Spotify, YouTube, Apple Music, etc.)
	script := fmt.Sprintf(`
do shell script "python3 -c '
import Quartz

def press_media_key(key_type):
    # Key down
    ev = Quartz.NSEvent.otherEventWithType_location_modifierFlags_timestamp_windowNumber_context_subtype_data1_data2_(
        14,  # NSSystemDefined
        (0, 0),
        0xa00,  # NX_KEYTYPE shift
        0,
        0,
        0,
        8,  # NX_SUBTYPE_AUX_CONTROL_BUTTONS
        (key_type << 16) | (0xa << 8),  # key down
        -1,
    )
    Quartz.CGEventPost(0, ev.CGEvent())
    # Key up
    ev = Quartz.NSEvent.otherEventWithType_location_modifierFlags_timestamp_windowNumber_context_subtype_data1_data2_(
        14,
        (0, 0),
        0xb00,
        0,
        0,
        0,
        8,
        (key_type << 16) | (0xb << 8),  # key up
        -1,
    )
    Quartz.CGEventPost(0, ev.CGEvent())

press_media_key(%d)
'"`, keyType)

	out, err := exec.Command("osascript", "-e", script).CombinedOutput()
	if err != nil {
		return jsonErr(fmt.Sprintf("media key failed: %s — %s", err, string(out)))
	}
	return jsonResult(map[string]any{"status": "pressed", "media_key": key})
}

func GetToolDefinitions() []map[string]any {
	return []map[string]any{
		toolDef("open_url", "Open a URL in a web browser. If 'browser' is specified, opens in that specific browser app (e.g. 'Google Chrome', 'Brave Browser', 'Arc'). If omitted, uses the system default. IMPORTANT: Always check memory_recall('preferred_browser') first and use that browser if set.",
			props{
				"url":     prop("string", "The URL to open."),
				"browser": prop("string", "Optional. Browser application name to use (e.g. 'Google Chrome', 'Brave Browser', 'Arc', 'Safari'). If omitted, uses system default."),
			}, []string{"url"}),
		toolDef("open_application", "Open an application on the user's computer. NOTE: For Spotify, this only opens the app — it does NOT play specific music. Use the spotify_play tool (from the Spotify module) instead to play songs/playlists via the Spotify API. open_application + press_media_key cannot select specific tracks.",
			props{"name": prop("string", "Application name.")}, []string{"name"}),
		toolDef("run_shell_command", "Run a shell command on the user's machine and return stdout/stderr.",
			props{
				"command":           prop("string", "The shell command to run."),
				"working_directory": prop("string", "Optional working directory."),
			}, []string{"command"}),
		toolDef("take_screenshot", "Take a screenshot of the user's screen and receive the image directly — you will be able to SEE the screenshot using vision. Use this for non-browser apps or as a fallback. The screenshot is automatically scaled to match click coordinates. Coordinates start at (0,0) top-left.",
			props{}, nil),
		toolDef("get_browser_dom", "Extract interactive elements from the active browser tab. Returns a structured numbered list of all clickable buttons, links, inputs, and other interactive elements — NOT raw HTML. Each element has an 'id' number. Use click_browser_element(id) to click or type_in_browser(id, text) to type. MUCH more reliable than screenshot+click_at for web pages. Works with Chrome, Arc, Brave, Edge, Safari. Firefox is NOT supported (use screenshot+click_at for Firefox).",
			props{
				"browser": prop("string", "Browser to target: 'chrome', 'safari', or 'auto' (default — tries all Chromium-family, then Safari)."),
			}, nil),
		toolDef("get_browser_url", "Get the URL of the currently active browser tab. Useful to confirm which page is open before interacting.",
			props{}, nil),
		toolDef("read_file", "Read the contents of a file on the user's machine.",
			props{"path": prop("string", "Absolute or relative file path.")}, []string{"path"}),
		toolDef("write_file", "Write content to a file.",
			props{
				"path":    prop("string", "File path to write to."),
				"content": prop("string", "Content to write."),
			}, []string{"path", "content"}),
		toolDef("list_directory", "List files and folders in a directory.",
			props{"path": prop("string", "Directory path. Defaults to current directory.")}, nil),
		toolDef("upload_file", "Upload a local file to Gumm server storage so it can be sent to Telegram or used by other tools. Returns a storageKey that you can use with send_telegram_file to send the file to Telegram. Use this when you need to send a local file (image, document, etc.) to the user via Telegram.",
			props{"path": prop("string", "Absolute path to the local file to upload.")}, []string{"path"}),
		toolDef("click_at", "Click at specific screen coordinates. Use take_screenshot first to see the screen and identify where to click. Coordinates are in pixels from top-left (0,0).",
			props{
				"x":      prop("number", "X coordinate (pixels from left edge)."),
				"y":      prop("number", "Y coordinate (pixels from top edge)."),
				"button": prop("string", "Mouse button: 'left' (default), 'right', or 'middle'."),
			}, []string{"x", "y"}),
		toolDef("double_click_at", "Double-click at specific screen coordinates.",
			props{
				"x": prop("number", "X coordinate (pixels from left edge)."),
				"y": prop("number", "Y coordinate (pixels from top edge)."),
			}, []string{"x", "y"}),
		toolDef("type_text", "Type text using the keyboard as if the user is typing. The target app must be focused first (use click_at to focus it).",
			props{"text": prop("string", "The text to type.")}, []string{"text"}),
		toolDef("press_key", "Press a keyboard key or key combination. Useful for shortcuts (e.g. Enter, Escape, Space, Tab, cmd+c, cmd+v).",
			props{
				"key":       prop("string", "The key to press (e.g. 'return', 'escape', 'space', 'tab', 'delete', 'up', 'down', 'left', 'right', or any letter/number)."),
				"modifiers": prop("array", "Optional modifier keys held during press: 'command', 'shift', 'option', 'control'."),
			}, []string{"key"}),
		toolDef("press_media_key", "Press a media key to control any playing media (Spotify, YouTube, Apple Music, etc.). Works universally across all media apps on macOS. NOTE: This only presses play/pause/next/previous — it cannot select a specific song. For playing specific Spotify tracks, use spotify_play instead.",
			props{
				"key": prop("string", "Media key: 'play_pause', 'next', 'previous', 'volume_up', 'volume_down', 'mute'."),
			}, []string{"key"}),
		toolDef("click_browser_element", "Click an interactive element in the browser by its ID number from get_browser_dom. This uses JavaScript to click the element directly — no coordinate guessing needed. The element is scrolled into view automatically. ALWAYS prefer this over click_at for web pages.",
			props{
				"id":      prop("number", "The element ID from get_browser_dom's elements list."),
				"browser": prop("string", "Browser to target (default: 'auto')."),
			}, []string{"id"}),
		toolDef("type_in_browser", "Type text into a browser input/textarea/contenteditable element by its ID from get_browser_dom. The element is focused and scrolled into view automatically. For contenteditable areas (rich text editors, post composers), text is inserted via execCommand for framework compatibility.",
			props{
				"id":      prop("number", "The element ID from get_browser_dom's elements list."),
				"text":    prop("string", "The text to type into the element."),
				"browser": prop("string", "Browser to target (default: 'auto')."),
			}, []string{"id", "text"}),
		toolDef("scroll_browser", "Scroll the active browser page up or down. Use this to reveal elements that are below the fold or to navigate long pages.",
			props{
				"direction": prop("string", "Scroll direction: 'up' or 'down' (default: 'down')."),
				"amount":    prop("number", "Pixels to scroll (default: 500)."),
				"browser":   prop("string", "Browser to target (default: 'auto')."),
			}, nil),
		toolDef("detect_browsers", "Detect which web browsers are installed on this machine, which ones are compatible with web automation (DOM + JS click), and which is the system default. Use this BEFORE any browser task if the user's preferred browser is not yet known (no memory_recall('preferred_browser') result). Returns installed browsers, compatible ones, and a recommendation.",
			props{}, nil),
	}
}

// helpers

type props = map[string]map[string]string

func prop(typ, desc string) map[string]string {
	return map[string]string{"type": typ, "description": desc}
}

func toolDef(name, desc string, properties props, required []string) map[string]any {
	params := map[string]any{
		"type":       "object",
		"properties": properties,
	}
	if required != nil {
		params["required"] = required
	} else {
		params["required"] = []string{}
	}
	return map[string]any{
		"type": "function",
		"function": map[string]any{
			"name":        name,
			"description": desc,
			"parameters":  params,
		},
	}
}

func getString(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func getInt(m map[string]any, key string) int {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		case json.Number:
			i, _ := n.Int64()
			return int(i)
		}
	}
	return 0
}

func getStringSlice(m map[string]any, key string) []string {
	if v, ok := m[key]; ok {
		if arr, ok := v.([]any); ok {
			result := make([]string, 0, len(arr))
			for _, item := range arr {
				if s, ok := item.(string); ok {
					result = append(result, s)
				}
			}
			return result
		}
	}
	return nil
}

func jsonResult(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func jsonErr(msg string) string {
	b, _ := json.Marshal(map[string]string{"error": msg})
	return string(b)
}

// ConfirmFn is a callback asking the user to approve a dangerous operation.
// For now in the Go TUI, shell commands are executed directly (the user sees them in the UI).
// A more sophisticated confirmation flow can be added later.
type ConfirmFn func(toolName, detail string) bool
