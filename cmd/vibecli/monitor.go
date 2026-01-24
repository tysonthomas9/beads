package main

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

var (
	monitorWatch    bool
	monitorInterval int
)

var monitorCmd = &cobra.Command{
	Use:     "monitor",
	Aliases: []string{"mon", "status"},
	Short:   "Display comprehensive agent and task dashboard",
	Long: `Display a dashboard showing agents, tasks, sync status, and statistics.

Sections:
  AGENTS     - Worktree status (running/idle, branch, dirty/clean)
  TASKS      - Ready, in_progress, need review, blocked counts
  SYNC       - Database and git sync status
  STATS      - Overall issue counts and completion rate

Flags:
  -w, --watch       Auto-refresh mode (default: 5s interval)
  -i, --interval    Refresh interval in seconds (default: 5)

Examples:
  vibecli monitor              # One-shot display
  vibecli monitor --watch      # Auto-refresh
  vibecli monitor -w -i 10     # Refresh every 10 seconds`,
	Args: cobra.NoArgs,
	Run:  runMonitor,
}

func init() {
	monitorCmd.Flags().BoolVarP(&monitorWatch, "watch", "w", false, "Auto-refresh mode")
	monitorCmd.Flags().IntVarP(&monitorInterval, "interval", "i", 5, "Refresh interval in seconds")
	rootCmd.AddCommand(monitorCmd)
}

// MonitorData holds all dashboard information
type MonitorData struct {
	Timestamp   time.Time
	Agents      []AgentStatus
	Tasks       TaskSummary
	ActiveTasks []ActiveTask
	SyncStatus  SyncInfo
	Stats       MonitorStats
}

// AgentStatus represents a single agent/worktree status
type AgentStatus struct {
	Name      string
	Branch    string
	Status    string // "clean", "3 changes", "running (plan, 5m ago)"
	NeedsPush bool
	NeedsPull bool
}

// TaskSummary holds task counts by category
type TaskSummary struct {
	Ready      int
	InProgress int
	NeedReview int
	Blocked    int
}

// ActiveTask represents an in-progress or need-review task
type ActiveTask struct {
	ID       string
	Title    string
	Priority int
	Status   string // "in_progress", "need_review"
}

// SyncInfo holds sync status information
type SyncInfo struct {
	DBSynced     bool
	DBLastSync   string
	DBError      string
	GitNeedsPush int
	GitNeedsPull int
}

// MonitorStats holds overall statistics
type MonitorStats struct {
	Open       int
	Closed     int
	Total      int
	Completion float64
}

// BdIssue represents an issue from bd list --json
type BdIssue struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Status   string `json:"status"`
	Priority int    `json:"priority"`
}

// BdStats represents output from bd stats --json
type BdStats struct {
	Summary struct {
		TotalIssues  int `json:"total_issues"`
		OpenIssues   int `json:"open_issues"`
		ClosedIssues int `json:"closed_issues"`
	} `json:"summary"`
}

func runMonitor(cmd *cobra.Command, args []string) {
	if monitorWatch {
		// Watch mode - clear screen and refresh
		for {
			clearScreen()
			data := collectMonitorData()
			fmt.Print(renderDashboard(data))
			fmt.Printf("\nPress Ctrl+C to exit (refreshing every %ds)\n", monitorInterval)
			time.Sleep(time.Duration(monitorInterval) * time.Second)
		}
	} else {
		// One-shot mode
		data := collectMonitorData()
		fmt.Print(renderDashboard(data))
	}
}

func clearScreen() {
	fmt.Print("\033[H\033[2J")
}

func collectMonitorData() *MonitorData {
	data := &MonitorData{Timestamp: time.Now()}

	// Collect agents
	data.Agents = collectAgentStatus()

	// Collect tasks
	data.Tasks, data.ActiveTasks = collectTaskStatus()

	// Collect sync status
	data.SyncStatus = collectSyncStatus(data.Agents)

	// Collect stats
	data.Stats = collectStatistics()

	return data
}

func collectAgentStatus() []AgentStatus {
	worktrees, err := DiscoverWorktrees()
	if err != nil {
		return nil
	}

	var agents []AgentStatus
	for _, wt := range worktrees {
		agent := AgentStatus{
			Name:   wt.Name,
			Branch: wt.Branch,
		}

		// Check for running agent (lock status)
		lockStatus := GetLockStatus(wt.Path)
		if lockStatus != "" {
			agent.Status = lockStatus
		} else {
			// Check git status
			clean, _ := IsCleanWorkingTree(wt.Path)
			if clean {
				agent.Status = "clean"
			} else {
				changes := getUncommittedChangesCount(wt.Path)
				if changes > 0 {
					agent.Status = fmt.Sprintf("%d changes", changes)
				} else {
					agent.Status = "dirty"
				}
			}
		}

		// Check if needs push/pull
		agent.NeedsPush, agent.NeedsPull = getWorktreeGitSyncStatus(wt.Path)

		agents = append(agents, agent)
	}

	return agents
}

func getWorktreeGitSyncStatus(path string) (needsPush, needsPull bool) {
	output, err := RunGitCommand(path, "status", "-sb")
	if err != nil {
		return false, false
	}
	needsPush = strings.Contains(output, "ahead")
	needsPull = strings.Contains(output, "behind")
	return
}

func collectTaskStatus() (TaskSummary, []ActiveTask) {
	var summary TaskSummary
	var active []ActiveTask

	// Get ready tasks count
	readyOutput, err := runBdCommand("ready", "--json")
	if err == nil {
		var issues []BdIssue
		if json.Unmarshal([]byte(readyOutput), &issues) == nil {
			summary.Ready = len(issues)
		}
	}

	// Get in_progress tasks
	inProgressOutput, err := runBdCommand("list", "--status=in_progress", "--json")
	if err == nil {
		var issues []BdIssue
		if json.Unmarshal([]byte(inProgressOutput), &issues) == nil {
			summary.InProgress = len(issues)
			for _, issue := range issues {
				active = append(active, ActiveTask{
					ID:       issue.ID,
					Title:    truncateString(issue.Title, 40),
					Priority: issue.Priority,
					Status:   "in_progress",
				})
			}
		}
	}

	// Get need review tasks
	needReviewOutput, err := runBdCommand("list", "--status=open", "--json")
	if err == nil {
		var issues []BdIssue
		if json.Unmarshal([]byte(needReviewOutput), &issues) == nil {
			for _, issue := range issues {
				if strings.Contains(issue.Title, "[Need Review]") {
					summary.NeedReview++
					active = append(active, ActiveTask{
						ID:       issue.ID,
						Title:    truncateString(issue.Title, 40),
						Priority: issue.Priority,
						Status:   "need_review",
					})
				}
			}
		}
	}

	// Get blocked tasks count
	blockedOutput, err := runBdCommand("blocked", "--json")
	if err == nil {
		var issues []BdIssue
		if json.Unmarshal([]byte(blockedOutput), &issues) == nil {
			summary.Blocked = len(issues)
		}
	}

	return summary, active
}

func collectSyncStatus(agents []AgentStatus) SyncInfo {
	var info SyncInfo

	// Check bd sync status
	syncOutput, err := runBdCommand("sync", "--status")
	if err == nil {
		info.DBSynced = !strings.Contains(syncOutput, "error") && !strings.Contains(syncOutput, "failed")
		info.DBLastSync = "recently"
	} else {
		info.DBError = "unable to check"
	}

	// Count git push/pull needs from agents
	for _, agent := range agents {
		if agent.NeedsPush {
			info.GitNeedsPush++
		}
		if agent.NeedsPull {
			info.GitNeedsPull++
		}
	}

	return info
}

func collectStatistics() MonitorStats {
	var stats MonitorStats

	// Get stats from bd
	statsOutput, err := runBdCommand("stats", "--json")
	if err == nil {
		var bdStats BdStats
		if json.Unmarshal([]byte(statsOutput), &bdStats) == nil {
			stats.Open = bdStats.Summary.OpenIssues
			stats.Closed = bdStats.Summary.ClosedIssues
			stats.Total = bdStats.Summary.TotalIssues
			if stats.Total > 0 {
				stats.Completion = float64(stats.Closed) / float64(stats.Total) * 100
			}
		}
	}

	return stats
}

func runBdCommand(args ...string) (string, error) {
	cmd := exec.Command("bd", args...)
	output, err := cmd.Output()
	return string(output), err
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

// Rendering functions

func renderDashboard(data *MonitorData) string {
	var sb strings.Builder
	width := 70

	// Header
	sb.WriteString(renderBoxTop(width))
	sb.WriteString(renderBoxLine(width, centerText("VIBECLI MONITOR", width-4)))
	sb.WriteString(renderBoxLine(width, centerText(fmt.Sprintf("Last updated: %s", data.Timestamp.Format("15:04:05")), width-4)))

	// Agents section
	sb.WriteString(renderBoxSeparator(width))
	sb.WriteString(renderBoxLine(width, " AGENTS"))
	sb.WriteString(renderBoxSeparator(width))
	for _, agent := range data.Agents {
		statusIcon := "✓"
		if strings.Contains(agent.Status, "running") {
			statusIcon = "●"
		} else if strings.Contains(agent.Status, "changes") || agent.Status == "dirty" {
			statusIcon = "●"
		}
		line := fmt.Sprintf("  %-10s  %-18s  %s %s", agent.Name, agent.Branch, statusIcon, agent.Status)
		if agent.NeedsPush {
			line += " [push]"
		}
		if agent.NeedsPull {
			line += " [pull]"
		}
		sb.WriteString(renderBoxLine(width, line))
	}
	if len(data.Agents) == 0 {
		sb.WriteString(renderBoxLine(width, "  No agents found"))
	}

	// Tasks section
	sb.WriteString(renderBoxSeparator(width))
	sb.WriteString(renderBoxLine(width, " TASKS"))
	sb.WriteString(renderBoxSeparator(width))
	taskSummary := fmt.Sprintf("  Ready: %-4d  In Progress: %-4d  Need Review: %-4d  Blocked: %-4d",
		data.Tasks.Ready, data.Tasks.InProgress, data.Tasks.NeedReview, data.Tasks.Blocked)
	sb.WriteString(renderBoxLine(width, taskSummary))

	if len(data.ActiveTasks) > 0 {
		sb.WriteString(renderBoxLine(width, ""))
		for _, task := range data.ActiveTasks {
			icon := "▶"
			if task.Status == "need_review" {
				icon = "⏸"
			}
			line := fmt.Sprintf("  [%s P%d] %s: %s", icon, task.Priority, task.ID, task.Title)
			sb.WriteString(renderBoxLine(width, line))
		}
	}

	// Sync section
	sb.WriteString(renderBoxSeparator(width))
	sb.WriteString(renderBoxLine(width, " SYNC STATUS"))
	sb.WriteString(renderBoxSeparator(width))

	dbStatus := "✓ synced"
	if !data.SyncStatus.DBSynced {
		dbStatus = "⚠ " + data.SyncStatus.DBError
	}
	sb.WriteString(renderBoxLine(width, fmt.Sprintf("  Database:  %s", dbStatus)))

	gitStatus := "✓ all synced"
	if data.SyncStatus.GitNeedsPush > 0 || data.SyncStatus.GitNeedsPull > 0 {
		parts := []string{}
		if data.SyncStatus.GitNeedsPush > 0 {
			parts = append(parts, fmt.Sprintf("%d need push", data.SyncStatus.GitNeedsPush))
		}
		if data.SyncStatus.GitNeedsPull > 0 {
			parts = append(parts, fmt.Sprintf("%d need pull", data.SyncStatus.GitNeedsPull))
		}
		gitStatus = "⚠ " + strings.Join(parts, ", ")
	}
	sb.WriteString(renderBoxLine(width, fmt.Sprintf("  Git:       %s", gitStatus)))

	// Stats section
	sb.WriteString(renderBoxSeparator(width))
	sb.WriteString(renderBoxLine(width, " STATS"))
	sb.WriteString(renderBoxSeparator(width))
	statsLine := fmt.Sprintf("  Open: %-4d  Closed: %-4d  Total: %-4d  Completion: %.0f%%",
		data.Stats.Open, data.Stats.Closed, data.Stats.Total, data.Stats.Completion)
	sb.WriteString(renderBoxLine(width, statsLine))

	// Footer
	sb.WriteString(renderBoxBottom(width))

	return sb.String()
}

func renderBoxTop(width int) string {
	return "╔" + strings.Repeat("═", width-2) + "╗\n"
}

func renderBoxBottom(width int) string {
	return "╚" + strings.Repeat("═", width-2) + "╝\n"
}

func renderBoxSeparator(width int) string {
	return "╠" + strings.Repeat("═", width-2) + "╣\n"
}

func renderBoxLine(width int, content string) string {
	// Pad content to width
	padding := width - 4 - len(content)
	if padding < 0 {
		content = content[:width-4]
		padding = 0
	}
	return "║ " + content + strings.Repeat(" ", padding) + " ║\n"
}

func centerText(text string, width int) string {
	if len(text) >= width {
		return text[:width]
	}
	padding := (width - len(text)) / 2
	return strings.Repeat(" ", padding) + text + strings.Repeat(" ", width-len(text)-padding)
}
