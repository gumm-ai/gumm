package agent

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
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
		return t.openURL(getString(args, "url"))
	case "open_application":
		return t.openApp(getString(args, "name"))
	case "run_shell_command":
		return t.runShell(getString(args, "command"), getString(args, "working_directory"))
	case "take_screenshot":
		return t.screenshot()
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
	default:
		return jsonErr("unknown tool: " + name)
	}
}

func (t *ToolExecutor) openURL(url string) string {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	default:
		cmd = exec.Command("cmd", "/c", "start", url)
	}
	_ = cmd.Start()
	return jsonResult(map[string]any{"status": "opened", "url": url})
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
	case "linux":
		if err := exec.Command("import", "-window", "root", path).Run(); err != nil {
			return jsonErr(err.Error())
		}
	default:
		return jsonErr("screenshot not supported on this platform")
	}
	return jsonResult(map[string]any{"status": "captured", "path": path})
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

func GetToolDefinitions() []map[string]any {
	return []map[string]any{
		toolDef("open_url", "Open a URL in the user's default web browser.",
			props{"url": prop("string", "The URL to open.")}, []string{"url"}),
		toolDef("open_application", "Open an application on the user's computer.",
			props{"name": prop("string", "Application name.")}, []string{"name"}),
		toolDef("run_shell_command", "Run a shell command on the user's machine and return stdout/stderr.",
			props{
				"command":           prop("string", "The shell command to run."),
				"working_directory": prop("string", "Optional working directory."),
			}, []string{"command"}),
		toolDef("take_screenshot", "Take a screenshot of the user's screen.",
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
