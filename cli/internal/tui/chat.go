package tui

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/gumm-ai/gumm/cli/internal/agent"
)

// ── Styles ──────────────────────────────────────────────────────────────

var (
	accent    = lipgloss.NewStyle().Foreground(lipgloss.Color("99")).Bold(true)
	userStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("252")).Bold(true)
	brainTag  = lipgloss.NewStyle().Foreground(lipgloss.Color("99")).Bold(true)
	toolStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	errStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("196")).Bold(true)
	okStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("114"))
	dimStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))

	statusBar = lipgloss.NewStyle().
			Foreground(lipgloss.Color("241")).
			Background(lipgloss.Color("235")).
			Padding(0, 1)

	inputBorder = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("62")).
			Padding(0, 0)
)

// ── Messages (Bubble Tea) ────────────────────────────────────────────────

type agentEventMsg agent.Event

// waitForEvent returns a command that reads the next event from the channel.
func waitForEvent(ch <-chan agent.Event) tea.Cmd {
	return func() tea.Msg {
		evt, ok := <-ch
		if !ok {
			return agentEventMsg{Type: agent.EventDone}
		}
		return agentEventMsg(evt)
	}
}

// ── Model ────────────────────────────────────────────────────────────────

type Model struct {
	viewport  viewport.Model
	input     textarea.Model
	agent     *agent.Agent
	brainName string
	modelName string

	eventCh       <-chan agent.Event // active stream channel
	lines         []string          // rendered chat lines
	streamStart   int               // index in lines where current stream began
	currentReply  string            // streaming reply buffer
	busy          bool
	width, height int
	ready         bool
}

func NewModel(a *agent.Agent, brainName, modelName string) Model {
	ti := textarea.New()
	ti.Placeholder = "Ask something..."
	ti.Focus()
	ti.CharLimit = 4096
	ti.SetHeight(1)
	ti.ShowLineNumbers = false
	ti.KeyMap.InsertNewline.SetEnabled(false)

	toolCount := a.ToolCount()

	return Model{
		agent:     a,
		brainName: brainName,
		modelName: modelName,
		input:     ti,
		lines: []string{
			"",
			accent.Render("  "+brainName) + "  " + dimStyle.Render(modelName),
			dimStyle.Render(fmt.Sprintf("  %d tools · ctrl+c quit · enter send", toolCount)),
			"",
		},
	}
}

func (m Model) Init() tea.Cmd {
	return textarea.Blink
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC:
			return m, tea.Quit
		case tea.KeyCtrlL:
			m.lines = m.lines[:0]
			m.refreshViewport()
			return m, nil
		case tea.KeyEnter:
			text := strings.TrimSpace(m.input.Value())
			if text == "" || m.busy {
				return m, nil
			}
			m.input.SetValue("")
			m.busy = true
			m.lines = append(m.lines, userStyle.Render("  you ")+dimStyle.Render("→ ")+text)
			m.lines = append(m.lines, "")
			m.currentReply = ""
			m.streamStart = len(m.lines)
			m.refreshViewport()

			// Start the agent goroutine and listen for events
			ch := make(chan agent.Event, 64)
			m.eventCh = ch
			go m.agent.Send(text, ch)
			return m, waitForEvent(ch)
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		inputHeight := 3
		statusHeight := 1
		vpHeight := m.height - inputHeight - statusHeight - 1

		if !m.ready {
			m.viewport = viewport.New(m.width, vpHeight)
			m.viewport.YPosition = 0
			m.ready = true
		} else {
			m.viewport.Width = m.width
			m.viewport.Height = vpHeight
		}
		m.input.SetWidth(m.width - 4)
		m.refreshViewport()
		return m, nil

	case agentEventMsg:
		evt := agent.Event(msg)
		var nextCmd tea.Cmd

		switch evt.Type {
		case agent.EventToken:
			m.currentReply += evt.Data
			m.updateStreamingLine()
			nextCmd = waitForEvent(m.eventCh)

		case agent.EventToolStart:
			m.flushReply()
			var info struct {
				Name string `json:"name"`
			}
			_ = json.Unmarshal([]byte(evt.Data), &info)
			m.lines = append(m.lines, toolStyle.Render("  ⚡ ")+dimStyle.Render(info.Name))
			m.streamStart = len(m.lines)
			nextCmd = waitForEvent(m.eventCh)

		case agent.EventToolEnd:
			var info struct {
				Name   string `json:"name"`
				Result string `json:"result"`
			}
			_ = json.Unmarshal([]byte(evt.Data), &info)
			var parsed map[string]any
			_ = json.Unmarshal([]byte(info.Result), &parsed)
			if errMsg, ok := parsed["error"].(string); ok {
				m.lines = append(m.lines, errStyle.Render("  ✗ ")+errMsg)
			} else if parsed["status"] == "denied" {
				m.lines = append(m.lines, dimStyle.Render("  ⊘ denied"))
			} else {
				m.lines = append(m.lines, okStyle.Render("  ✓ ")+dimStyle.Render(info.Name+" done"))
			}
			m.lines = append(m.lines, "")
			m.streamStart = len(m.lines)
			nextCmd = waitForEvent(m.eventCh)

		case agent.EventError:
			m.flushReply()
			m.lines = append(m.lines, errStyle.Render("  error: ")+evt.Data)
			m.lines = append(m.lines, "")
			m.busy = false
			m.eventCh = nil

		case agent.EventDone:
			m.flushReply()
			m.busy = false
			m.eventCh = nil
		}

		m.refreshViewport()
		if nextCmd != nil {
			return m, nextCmd
		}
		return m, nil
	}

	// Update sub-components
	if !m.busy {
		var tiCmd tea.Cmd
		m.input, tiCmd = m.input.Update(msg)
		cmds = append(cmds, tiCmd)
	}

	var vpCmd tea.Cmd
	m.viewport, vpCmd = m.viewport.Update(msg)
	cmds = append(cmds, vpCmd)

	return m, tea.Batch(cmds...)
}

func (m Model) View() string {
	if !m.ready {
		return "loading..."
	}

	// Status bar
	status := "  " + m.brainName
	if m.busy {
		status += "  ●  thinking..."
	}
	bar := statusBar.Width(m.width).Render(status)

	// Input area
	inputBox := inputBorder.Width(m.width - 2).Render(m.input.View())

	return lipgloss.JoinVertical(
		lipgloss.Left,
		m.viewport.View(),
		bar,
		inputBox,
	)
}

// ── Helpers ──────────────────────────────────────────────────────────────

func (m *Model) refreshViewport() {
	content := strings.Join(m.lines, "\n")
	m.viewport.SetContent(content)
	m.viewport.GotoBottom()
}

func (m *Model) updateStreamingLine() {
	tag := brainTag.Render("  "+m.brainName) + " "

	// Word-wrap the reply
	wrapped := wordWrap(m.currentReply, m.width-8)
	parts := strings.Split(wrapped, "\n")

	// Trim lines back to where streaming started
	m.lines = m.lines[:m.streamStart]

	// Re-render all streaming lines
	for i, line := range parts {
		if i == 0 {
			m.lines = append(m.lines, tag+line)
		} else {
			m.lines = append(m.lines, "      "+line)
		}
	}
}

func (m *Model) flushReply() {
	if m.currentReply == "" {
		return
	}
	// Streaming lines are already in m.lines, just add a trailing blank line
	m.lines = append(m.lines, "")
	m.currentReply = ""
	m.streamStart = len(m.lines)
}

func wordWrap(s string, width int) string {
	if width <= 0 {
		width = 80
	}
	var result strings.Builder
	for i, line := range strings.Split(s, "\n") {
		if i > 0 {
			result.WriteString("\n")
		}
		if len(line) <= width {
			result.WriteString(line)
			continue
		}
		words := strings.Fields(line)
		currentLine := ""
		for _, word := range words {
			if currentLine == "" {
				currentLine = word
			} else if len(currentLine)+1+len(word) <= width {
				currentLine += " " + word
			} else {
				if result.Len() > 0 {
					result.WriteString("\n")
				}
				result.WriteString(currentLine)
				currentLine = word
			}
		}
		if currentLine != "" {
			if result.Len() > 0 {
				result.WriteString("\n")
			}
			result.WriteString(currentLine)
		}
	}
	return result.String()
}
