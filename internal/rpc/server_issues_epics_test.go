package rpc

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/steveyegge/beads/internal/types"
)

// TestUpdatesFromArgs_DueAt verifies that DueAt is extracted from UpdateArgs
// and included in the updates map for the storage layer.
//
// This test is a TRACER BULLET for GH#952 Issue 1: Daemon ignoring --due flag.
// Gap 1: updatesFromArgs() handles 19 fields but DueAt/DeferUntil are MISSING.
//
// Expected behavior: When UpdateArgs.DueAt contains an RFC3339 date string,
// it should be parsed and added to the updates map as a time.Time value.
func TestUpdatesFromArgs_DueAt(t *testing.T) {
	tests := map[string]struct {
		input    string // ISO date or RFC3339 format
		wantKey  string
		wantTime bool // if true, expect time.Time value; if false, expect nil
	}{
		"RFC3339 with timezone": {
			input:    "2026-01-15T10:00:00Z",
			wantKey:  "due_at",
			wantTime: true,
		},
		"ISO date only": {
			input:    "2026-01-15",
			wantKey:  "due_at",
			wantTime: true,
		},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			args := UpdateArgs{
				ID:    "test-issue",
				DueAt: &tt.input,
			}

			updates, err := updatesFromArgs(args)
			if err != nil {
				t.Fatalf("updatesFromArgs returned error: %v", err)
			}

			val, exists := updates[tt.wantKey]
			if !exists {
				t.Fatalf("updatesFromArgs did not include %q key; got keys: %v", tt.wantKey, mapKeys(updates))
			}

			if tt.wantTime {
				if _, ok := val.(time.Time); !ok {
					t.Errorf("expected time.Time value for %q, got %T: %v", tt.wantKey, val, val)
				}
			}
		})
	}
}

// TestUpdatesFromArgs_DeferUntil verifies that DeferUntil is extracted from UpdateArgs
// and included in the updates map for the storage layer.
//
// This test is a TRACER BULLET for GH#952 Issue 1: Daemon ignoring --defer flag.
// Gap 1: updatesFromArgs() handles 19 fields but DueAt/DeferUntil are MISSING.
//
// Expected behavior: When UpdateArgs.DeferUntil contains an RFC3339 date string,
// it should be parsed and added to the updates map as a time.Time value.
func TestUpdatesFromArgs_DeferUntil(t *testing.T) {
	tests := map[string]struct {
		input    string // ISO date or RFC3339 format
		wantKey  string
		wantTime bool
	}{
		"RFC3339 with timezone": {
			input:    "2026-01-20T14:30:00Z",
			wantKey:  "defer_until",
			wantTime: true,
		},
		"ISO date only": {
			input:    "2026-01-20",
			wantKey:  "defer_until",
			wantTime: true,
		},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			args := UpdateArgs{
				ID:         "test-issue",
				DeferUntil: &tt.input,
			}

			updates, err := updatesFromArgs(args)
			if err != nil {
				t.Fatalf("updatesFromArgs returned error: %v", err)
			}

			val, exists := updates[tt.wantKey]
			if !exists {
				t.Fatalf("updatesFromArgs did not include %q key; got keys: %v", tt.wantKey, mapKeys(updates))
			}

			if tt.wantTime {
				if _, ok := val.(time.Time); !ok {
					t.Errorf("expected time.Time value for %q, got %T: %v", tt.wantKey, val, val)
				}
			}
		})
	}
}

// TestUpdatesFromArgs_ClearFields verifies that empty strings clear date fields.
//
// This test is a TRACER BULLET for GH#952: verifying that undefer works.
// When an empty string is passed for DueAt or DeferUntil, it should result in
// a nil value in the updates map, which will clear the field in the database.
//
// Expected behavior: Empty string input should set the field to nil in updates map.
func TestUpdatesFromArgs_ClearFields(t *testing.T) {
	tests := map[string]struct {
		setupArgs func() UpdateArgs
		wantKey   string
	}{
		"clear due_at with empty string": {
			setupArgs: func() UpdateArgs {
				empty := ""
				return UpdateArgs{
					ID:    "test-issue",
					DueAt: &empty,
				}
			},
			wantKey: "due_at",
		},
		"clear defer_until with empty string": {
			setupArgs: func() UpdateArgs {
				empty := ""
				return UpdateArgs{
					ID:         "test-issue",
					DeferUntil: &empty,
				}
			},
			wantKey: "defer_until",
		},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			args := tt.setupArgs()

			updates, err := updatesFromArgs(args)
			if err != nil {
				t.Fatalf("updatesFromArgs returned error: %v", err)
			}

			val, exists := updates[tt.wantKey]
			if !exists {
				t.Fatalf("updatesFromArgs did not include %q key for clearing; got keys: %v", tt.wantKey, mapKeys(updates))
			}

			// When clearing, value should be nil (not an empty string)
			if val != nil {
				t.Errorf("expected nil value for clearing %q, got %T: %v", tt.wantKey, val, val)
			}
		})
	}
}

// TestHandleCreate_DeferUntil verifies that DeferUntil is parsed and set in handleCreate.
//
// This test is a TRACER BULLET for GH#952 Issue 1: Daemon ignoring --defer in create.
// Gap 2: handleCreate() parses DueAt (lines 224-239) but NOT DeferUntil.
//
// Expected behavior: When CreateArgs.DeferUntil contains an ISO date or RFC3339 string,
// it should be parsed and set on the created issue's DeferUntil field.
func TestHandleCreate_DeferUntil(t *testing.T) {
	_, client, cleanup := setupTestServer(t)
	defer cleanup()

	tests := map[string]struct {
		deferUntil string
		wantSet    bool // true if DeferUntil should be set on the issue
	}{
		"RFC3339 format": {
			deferUntil: "2026-01-20T14:30:00Z",
			wantSet:    true,
		},
		"ISO date format": {
			deferUntil: "2026-01-20",
			wantSet:    true,
		},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			createArgs := &CreateArgs{
				Title:      "Test issue with defer - " + name,
				IssueType:  "task",
				Priority:   1,
				DeferUntil: tt.deferUntil,
			}

			resp, err := client.Create(createArgs)
			if err != nil {
				t.Fatalf("Create failed: %v", err)
			}
			if !resp.Success {
				t.Fatalf("Create returned error: %s", resp.Error)
			}

			var issue types.Issue
			if err := json.Unmarshal(resp.Data, &issue); err != nil {
				t.Fatalf("Failed to unmarshal issue: %v", err)
			}

			if tt.wantSet {
				if issue.DeferUntil == nil {
					t.Error("expected DeferUntil to be set, got nil")
				}
			}
		})
	}
}

// TestUpdateViaDaemon_DueAt tests end-to-end update of DueAt through the daemon RPC.
//
// This test verifies that `bd update --due` works via daemon mode.
// It creates an issue, updates it with a due date via RPC, and verifies
// the due date was actually persisted.
func TestUpdateViaDaemon_DueAt(t *testing.T) {
	_, client, store, cleanup := setupTestServerWithStore(t)
	defer cleanup()

	ctx := context.Background()

	// Create an issue without due date
	createArgs := &CreateArgs{
		Title:     "Issue for due date update test",
		IssueType: "task",
		Priority:  1,
	}

	createResp, err := client.Create(createArgs)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	var issue types.Issue
	if err := json.Unmarshal(createResp.Data, &issue); err != nil {
		t.Fatalf("Failed to unmarshal issue: %v", err)
	}

	// Update with due date via daemon RPC
	dueDate := "2026-01-25"
	updateArgs := &UpdateArgs{
		ID:    issue.ID,
		DueAt: &dueDate,
	}

	updateResp, err := client.Update(updateArgs)
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if !updateResp.Success {
		t.Fatalf("Update returned error: %s", updateResp.Error)
	}

	// Verify directly from storage
	retrieved, err := store.GetIssue(ctx, issue.ID)
	if err != nil {
		t.Fatalf("Failed to get issue: %v", err)
	}

	if retrieved.DueAt == nil {
		t.Fatal("expected DueAt to be set after update, got nil")
	}

	// Verify the date is correct (just check the date part)
	expectedDate := time.Date(2026, 1, 25, 0, 0, 0, 0, time.Local)
	if retrieved.DueAt.Year() != expectedDate.Year() ||
		retrieved.DueAt.Month() != expectedDate.Month() ||
		retrieved.DueAt.Day() != expectedDate.Day() {
		t.Errorf("DueAt date mismatch: got %v, want date 2026-01-25", retrieved.DueAt)
	}
}

// TestUpdateViaDaemon_DeferUntil tests end-to-end update of DeferUntil through the daemon RPC.
//
// This test verifies that `bd update --defer` and `bd defer --until` work via daemon mode.
func TestUpdateViaDaemon_DeferUntil(t *testing.T) {
	_, client, store, cleanup := setupTestServerWithStore(t)
	defer cleanup()

	ctx := context.Background()

	// Create an issue without defer_until
	createArgs := &CreateArgs{
		Title:     "Issue for defer update test",
		IssueType: "task",
		Priority:  1,
	}

	createResp, err := client.Create(createArgs)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	var issue types.Issue
	if err := json.Unmarshal(createResp.Data, &issue); err != nil {
		t.Fatalf("Failed to unmarshal issue: %v", err)
	}

	// Update with defer_until via daemon RPC
	deferDate := "2026-01-30"
	updateArgs := &UpdateArgs{
		ID:         issue.ID,
		DeferUntil: &deferDate,
	}

	updateResp, err := client.Update(updateArgs)
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if !updateResp.Success {
		t.Fatalf("Update returned error: %s", updateResp.Error)
	}

	// Verify directly from storage
	retrieved, err := store.GetIssue(ctx, issue.ID)
	if err != nil {
		t.Fatalf("Failed to get issue: %v", err)
	}

	if retrieved.DeferUntil == nil {
		t.Fatal("expected DeferUntil to be set after update, got nil")
	}

	// Verify the date is correct
	expectedDate := time.Date(2026, 1, 30, 0, 0, 0, 0, time.Local)
	if retrieved.DeferUntil.Year() != expectedDate.Year() ||
		retrieved.DeferUntil.Month() != expectedDate.Month() ||
		retrieved.DeferUntil.Day() != expectedDate.Day() {
		t.Errorf("DeferUntil date mismatch: got %v, want date 2026-01-30", retrieved.DeferUntil)
	}
}

// TestUndefer_ClearsDeferUntil tests that undefer clears the defer_until field via daemon.
//
// This verifies SC-005: `bd undefer` clears defer_until via daemon.
func TestUndefer_ClearsDeferUntil(t *testing.T) {
	_, client, store, cleanup := setupTestServerWithStore(t)
	defer cleanup()

	ctx := context.Background()

	// Create an issue with defer_until set
	createArgs := &CreateArgs{
		Title:      "Issue to undefer",
		IssueType:  "task",
		Priority:   1,
		DeferUntil: "2026-02-15",
	}

	createResp, err := client.Create(createArgs)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	var issue types.Issue
	if err := json.Unmarshal(createResp.Data, &issue); err != nil {
		t.Fatalf("Failed to unmarshal issue: %v", err)
	}

	// Verify defer_until was set on create
	retrieved, err := store.GetIssue(ctx, issue.ID)
	if err != nil {
		t.Fatalf("Failed to get issue: %v", err)
	}
	if retrieved.DeferUntil == nil {
		t.Log("WARNING: DeferUntil not set on create - Gap 2 not yet fixed")
		// Set it directly for this test
		deferTime := time.Date(2026, 2, 15, 0, 0, 0, 0, time.Local)
		updates := map[string]interface{}{"defer_until": deferTime}
		if err := store.UpdateIssue(ctx, issue.ID, updates, "test"); err != nil {
			t.Fatalf("Failed to set defer_until directly: %v", err)
		}
	}

	// Now clear defer_until via RPC update with empty string
	empty := ""
	updateArgs := &UpdateArgs{
		ID:         issue.ID,
		DeferUntil: &empty,
	}

	updateResp, err := client.Update(updateArgs)
	if err != nil {
		t.Fatalf("Update (undefer) failed: %v", err)
	}
	if !updateResp.Success {
		t.Fatalf("Update (undefer) returned error: %s", updateResp.Error)
	}

	// Verify defer_until was cleared
	retrieved, err = store.GetIssue(ctx, issue.ID)
	if err != nil {
		t.Fatalf("Failed to get issue after undefer: %v", err)
	}

	if retrieved.DeferUntil != nil {
		t.Errorf("expected DeferUntil to be nil after undefer, got %v", retrieved.DeferUntil)
	}
}

// TestCreateWithRelativeDate tests that relative date formats like "+1d" work via daemon create.
//
// This test validates GH#952 Issue 3 fix: CLI formats relative dates as RFC3339.
// Gap 3 fix: create.go now converts "+1d", "tomorrow" etc. to RFC3339 before sending.
//
// This test simulates the fixed CLI behavior by pre-formatting relative dates.
// The daemon receives RFC3339 strings and parses them correctly.
func TestCreateWithRelativeDate(t *testing.T) {
	_, client, store, cleanup := setupTestServerWithStore(t)
	defer cleanup()

	ctx := context.Background()
	now := time.Now()

	tests := map[string]struct {
		dueOffset   time.Duration // Duration from now for DueAt
		deferOffset time.Duration // Duration from now for DeferUntil
		wantDue     bool
		wantDefer   bool
	}{
		"relative +1d for due": {
			dueOffset: 24 * time.Hour,
			wantDue:   true,
		},
		"relative tomorrow for defer": {
			deferOffset: 24 * time.Hour,
			wantDefer:   true,
		},
		"both relative dates": {
			dueOffset:   48 * time.Hour,
			deferOffset: 24 * time.Hour,
			wantDue:     true,
			wantDefer:   true,
		},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			// Simulate what create.go now does: format times as RFC3339
			var dueStr, deferStr string
			if tt.dueOffset > 0 {
				dueStr = now.Add(tt.dueOffset).Format(time.RFC3339)
			}
			if tt.deferOffset > 0 {
				deferStr = now.Add(tt.deferOffset).Format(time.RFC3339)
			}

			createArgs := &CreateArgs{
				Title:      "Issue with relative date - " + name,
				IssueType:  "task",
				Priority:   1,
				DueAt:      dueStr,
				DeferUntil: deferStr,
			}

			resp, err := client.Create(createArgs)
			if err != nil {
				t.Fatalf("Create failed: %v", err)
			}
			if !resp.Success {
				// This is expected to fail currently because the daemon doesn't parse relative dates
				t.Logf("Create returned error (expected with current bug): %s", resp.Error)
				t.Fatalf("Create failed with relative date: %s", resp.Error)
			}

			var issue types.Issue
			if err := json.Unmarshal(resp.Data, &issue); err != nil {
				t.Fatalf("Failed to unmarshal issue: %v", err)
			}

			// Verify from storage to ensure persistence
			retrieved, err := store.GetIssue(ctx, issue.ID)
			if err != nil {
				t.Fatalf("Failed to get issue: %v", err)
			}

			if tt.wantDue {
				if retrieved.DueAt == nil {
					t.Error("expected DueAt to be set from relative date, got nil")
				} else {
					// Verify it's in the future
					if retrieved.DueAt.Before(time.Now()) {
						t.Errorf("expected DueAt to be in the future, got %v", retrieved.DueAt)
					}
				}
			}

			if tt.wantDefer {
				if retrieved.DeferUntil == nil {
					t.Error("expected DeferUntil to be set from relative date, got nil")
				} else {
					// Verify it's in the future
					if retrieved.DeferUntil.Before(time.Now()) {
						t.Errorf("expected DeferUntil to be in the future, got %v", retrieved.DeferUntil)
					}
				}
			}
		})
	}
}

// mapKeys returns the keys of a map for debugging
func mapKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// TestDualPathParity validates that daemon mode produces identical results to direct mode.
// This test prevents regressions like GH#952 where new fields work in direct mode but
// fail in daemon mode due to missing extraction in updatesFromArgs() or handleCreate().
//
// ADD NEW FIELDS HERE when extending the Issue type to prevent future gaps.
func TestDualPathParity(t *testing.T) {
	_, client, store, cleanup := setupTestServerWithStore(t)
	defer cleanup()
	ctx := context.Background()

	now := time.Now()
	dueAt := now.Add(24 * time.Hour)
	deferUntil := now.Add(48 * time.Hour)

	t.Run("Create_DueAt", func(t *testing.T) {
		// Direct mode: set field directly on Issue struct
		directIssue := &types.Issue{
			Title:     "Direct DueAt",
			IssueType: "task",
			Priority:  1,
			Status:    types.StatusOpen,
			DueAt:     &dueAt,
			CreatedAt: now,
		}
		if err := store.CreateIssue(ctx, directIssue, "bd"); err != nil {
			t.Fatalf("Direct create failed: %v", err)
		}

		// Daemon mode: send via RPC
		resp, err := client.Create(&CreateArgs{
			Title:     "Daemon DueAt",
			IssueType: "task",
			Priority:  1,
			DueAt:     dueAt.Format(time.RFC3339),
		})
		if err != nil || !resp.Success {
			t.Fatalf("Daemon create failed: %v / %s", err, resp.Error)
		}
		var daemonIssue types.Issue
		if err := json.Unmarshal(resp.Data, &daemonIssue); err != nil {
			t.Fatalf("Failed to unmarshal: %v", err)
		}

		// Compare persisted values
		directRetrieved, _ := store.GetIssue(ctx, directIssue.ID)
		daemonRetrieved, _ := store.GetIssue(ctx, daemonIssue.ID)

		if !compareTimePtr(t, "DueAt", directRetrieved.DueAt, daemonRetrieved.DueAt) {
			t.Error("PARITY FAILURE: DueAt differs between direct and daemon mode")
		}
	})

	t.Run("Create_DeferUntil", func(t *testing.T) {
		// Direct mode
		directIssue := &types.Issue{
			Title:      "Direct DeferUntil",
			IssueType:  "task",
			Priority:   1,
			Status:     types.StatusOpen,
			DeferUntil: &deferUntil,
			CreatedAt:  now,
		}
		if err := store.CreateIssue(ctx, directIssue, "bd"); err != nil {
			t.Fatalf("Direct create failed: %v", err)
		}

		// Daemon mode
		resp, err := client.Create(&CreateArgs{
			Title:      "Daemon DeferUntil",
			IssueType:  "task",
			Priority:   1,
			DeferUntil: deferUntil.Format(time.RFC3339),
		})
		if err != nil || !resp.Success {
			t.Fatalf("Daemon create failed: %v / %s", err, resp.Error)
		}
		var daemonIssue types.Issue
		if err := json.Unmarshal(resp.Data, &daemonIssue); err != nil {
			t.Fatalf("Failed to unmarshal: %v", err)
		}

		// Compare persisted values
		directRetrieved, _ := store.GetIssue(ctx, directIssue.ID)
		daemonRetrieved, _ := store.GetIssue(ctx, daemonIssue.ID)

		if !compareTimePtr(t, "DeferUntil", directRetrieved.DeferUntil, daemonRetrieved.DeferUntil) {
			t.Error("PARITY FAILURE: DeferUntil differs between direct and daemon mode")
		}
	})

	t.Run("Update_DueAt", func(t *testing.T) {
		// Create base issue
		issue := &types.Issue{
			Title:     "Update DueAt Test",
			IssueType: "task",
			Priority:  1,
			Status:    types.StatusOpen,
			CreatedAt: now,
		}
		if err := store.CreateIssue(ctx, issue, "bd"); err != nil {
			t.Fatalf("Create failed: %v", err)
		}

		// Update via daemon
		dueStr := dueAt.Format(time.RFC3339)
		resp, err := client.Update(&UpdateArgs{
			ID:    issue.ID,
			DueAt: &dueStr,
		})
		if err != nil || !resp.Success {
			t.Fatalf("Daemon update failed: %v / %s", err, resp.Error)
		}

		// Verify persisted
		retrieved, _ := store.GetIssue(ctx, issue.ID)
		if retrieved.DueAt == nil {
			t.Error("PARITY FAILURE: DueAt not set after daemon update")
		} else if retrieved.DueAt.Sub(dueAt).Abs() > time.Second {
			t.Errorf("PARITY FAILURE: DueAt mismatch: got %v, want %v", *retrieved.DueAt, dueAt)
		}
	})

	t.Run("Update_DeferUntil", func(t *testing.T) {
		// Create base issue
		issue := &types.Issue{
			Title:     "Update DeferUntil Test",
			IssueType: "task",
			Priority:  1,
			Status:    types.StatusOpen,
			CreatedAt: now,
		}
		if err := store.CreateIssue(ctx, issue, "bd"); err != nil {
			t.Fatalf("Create failed: %v", err)
		}

		// Update via daemon
		deferStr := deferUntil.Format(time.RFC3339)
		resp, err := client.Update(&UpdateArgs{
			ID:         issue.ID,
			DeferUntil: &deferStr,
		})
		if err != nil || !resp.Success {
			t.Fatalf("Daemon update failed: %v / %s", err, resp.Error)
		}

		// Verify persisted
		retrieved, _ := store.GetIssue(ctx, issue.ID)
		if retrieved.DeferUntil == nil {
			t.Error("PARITY FAILURE: DeferUntil not set after daemon update")
		} else if retrieved.DeferUntil.Sub(deferUntil).Abs() > time.Second {
			t.Errorf("PARITY FAILURE: DeferUntil mismatch: got %v, want %v", *retrieved.DeferUntil, deferUntil)
		}
	})

	// ADD NEW FIELD PARITY TESTS HERE when extending Issue type
}

// compareTimePtr compares two time pointers with 1-second tolerance
func compareTimePtr(t *testing.T, name string, direct, daemon *time.Time) bool {
	if (direct == nil) != (daemon == nil) {
		t.Errorf("%s nil mismatch: direct=%v, daemon=%v", name, direct, daemon)
		return false
	}
	if direct != nil && daemon != nil {
		// Allow 1-second tolerance for parsing/timezone differences
		if direct.Sub(*daemon).Abs() > time.Second {
			t.Errorf("%s value mismatch: direct=%v, daemon=%v", name, *direct, *daemon)
			return false
		}
	}
	return true
}

// TestGetParentIDs_RPC tests the RPC handler for getting parent IDs
func TestGetParentIDs_RPC(t *testing.T) {
	_, client, store, cleanup := setupTestServerWithStore(t)
	defer cleanup()

	ctx := context.Background()

	// Create an epic (parent) and two tasks (children)
	epic := &types.Issue{
		Title:     "Epic Feature",
		Status:    types.StatusOpen,
		Priority:  1,
		IssueType: types.TypeEpic,
	}
	task1 := &types.Issue{
		Title:     "Task 1",
		Status:    types.StatusOpen,
		Priority:  1,
		IssueType: types.TypeTask,
	}
	task2 := &types.Issue{
		Title:     "Task 2",
		Status:    types.StatusOpen,
		Priority:  1,
		IssueType: types.TypeTask,
	}
	task3 := &types.Issue{
		Title:     "Task 3 (no parent)",
		Status:    types.StatusOpen,
		Priority:  1,
		IssueType: types.TypeTask,
	}

	if err := store.CreateIssue(ctx, epic, "test-user"); err != nil {
		t.Fatalf("CreateIssue epic failed: %v", err)
	}
	if err := store.CreateIssue(ctx, task1, "test-user"); err != nil {
		t.Fatalf("CreateIssue task1 failed: %v", err)
	}
	if err := store.CreateIssue(ctx, task2, "test-user"); err != nil {
		t.Fatalf("CreateIssue task2 failed: %v", err)
	}
	if err := store.CreateIssue(ctx, task3, "test-user"); err != nil {
		t.Fatalf("CreateIssue task3 failed: %v", err)
	}

	// Add parent-child dependencies
	if err := store.AddDependency(ctx, &types.Dependency{
		IssueID:     task1.ID,
		DependsOnID: epic.ID,
		Type:        types.DepParentChild,
	}, "test-user"); err != nil {
		t.Fatalf("AddDependency for task1 failed: %v", err)
	}

	if err := store.AddDependency(ctx, &types.Dependency{
		IssueID:     task2.ID,
		DependsOnID: epic.ID,
		Type:        types.DepParentChild,
	}, "test-user"); err != nil {
		t.Fatalf("AddDependency for task2 failed: %v", err)
	}

	// Test RPC call
	resp, err := client.GetParentIDs(&GetParentIDsArgs{
		IssueIDs: []string{task1.ID, task2.ID, task3.ID, epic.ID},
	})
	if err != nil {
		t.Fatalf("GetParentIDs RPC failed: %v", err)
	}

	// Verify task1 has epic as parent
	if info, ok := resp.Parents[task1.ID]; !ok {
		t.Errorf("Expected parent info for task1")
	} else {
		if info.ParentID != epic.ID {
			t.Errorf("Expected task1 parent to be %s, got %s", epic.ID, info.ParentID)
		}
		if info.ParentTitle != "Epic Feature" {
			t.Errorf("Expected parent title 'Epic Feature', got %s", info.ParentTitle)
		}
	}

	// Verify task2 has epic as parent
	if info, ok := resp.Parents[task2.ID]; !ok {
		t.Errorf("Expected parent info for task2")
	} else {
		if info.ParentID != epic.ID {
			t.Errorf("Expected task2 parent to be %s, got %s", epic.ID, info.ParentID)
		}
	}

	// Verify task3 has no parent
	if _, ok := resp.Parents[task3.ID]; ok {
		t.Errorf("Expected no parent info for task3 (orphan)")
	}

	// Verify epic has no parent
	if _, ok := resp.Parents[epic.ID]; ok {
		t.Errorf("Expected no parent info for epic")
	}
}

// TestGetParentIDs_RPC_EmptyInput tests the RPC handler with empty input
func TestGetParentIDs_RPC_EmptyInput(t *testing.T) {
	_, client, _, cleanup := setupTestServerWithStore(t)
	defer cleanup()

	// Test with empty slice
	resp, err := client.GetParentIDs(&GetParentIDsArgs{
		IssueIDs: []string{},
	})
	if err != nil {
		t.Fatalf("GetParentIDs RPC failed on empty input: %v", err)
	}

	if len(resp.Parents) != 0 {
		t.Errorf("Expected empty map for empty input, got %d entries", len(resp.Parents))
	}
}

// TestGetParentIDs_RPC_NoParents tests the RPC handler when no issues have parents
func TestGetParentIDs_RPC_NoParents(t *testing.T) {
	_, client, store, cleanup := setupTestServerWithStore(t)
	defer cleanup()

	ctx := context.Background()

	// Create issues with no parent-child relationships
	task1 := &types.Issue{
		Title:     "Task 1",
		Status:    types.StatusOpen,
		Priority:  1,
		IssueType: types.TypeTask,
	}
	task2 := &types.Issue{
		Title:     "Task 2",
		Status:    types.StatusOpen,
		Priority:  1,
		IssueType: types.TypeTask,
	}

	if err := store.CreateIssue(ctx, task1, "test-user"); err != nil {
		t.Fatalf("CreateIssue task1 failed: %v", err)
	}
	if err := store.CreateIssue(ctx, task2, "test-user"); err != nil {
		t.Fatalf("CreateIssue task2 failed: %v", err)
	}

	// Add a non-parent-child dependency (blocks)
	if err := store.AddDependency(ctx, &types.Dependency{
		IssueID:     task1.ID,
		DependsOnID: task2.ID,
		Type:        types.DepBlocks,
	}, "test-user"); err != nil {
		t.Fatalf("AddDependency failed: %v", err)
	}

	// Test RPC call
	resp, err := client.GetParentIDs(&GetParentIDsArgs{
		IssueIDs: []string{task1.ID, task2.ID},
	})
	if err != nil {
		t.Fatalf("GetParentIDs RPC failed: %v", err)
	}

	// Neither issue should have parent info (blocks dependency is not parent-child)
	if len(resp.Parents) != 0 {
		t.Errorf("Expected 0 parent entries for issues with only blocks dependency, got %d", len(resp.Parents))
	}
}

// TestShowIssueDetailsJSONStructure verifies that IssueDetails JSON serialization
// always includes labels, dependencies, dependents, and comments fields as empty arrays
// rather than omitting them when empty (GH#bd-rrtu).
//
// This is critical for frontend type guards that expect consistent JSON structure.
func TestShowIssueDetailsJSONStructure(t *testing.T) {
	_, client, cleanup := setupTestServer(t)
	defer cleanup()

	// Create a minimal issue with no labels, dependencies, or comments
	createArgs := &CreateArgs{
		Title:     "Issue without related data",
		IssueType: "task",
		Priority:  2,
	}

	createResp, err := client.Create(createArgs)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if !createResp.Success {
		t.Fatalf("Create returned error: %s", createResp.Error)
	}

	var issue types.Issue
	if err := json.Unmarshal(createResp.Data, &issue); err != nil {
		t.Fatalf("Failed to unmarshal issue: %v", err)
	}

	// Show the issue to get IssueDetails response
	showArgs := &ShowArgs{ID: issue.ID}
	showResp, err := client.Show(showArgs)
	if err != nil {
		t.Fatalf("Show failed: %v", err)
	}
	if !showResp.Success {
		t.Fatalf("Show returned error: %s", showResp.Error)
	}

	// Parse the raw JSON to verify structure
	var rawJSON map[string]interface{}
	if err := json.Unmarshal(showResp.Data, &rawJSON); err != nil {
		t.Fatalf("Failed to unmarshal raw JSON: %v", err)
	}

	// Verify that all required fields are present (not omitted)
	requiredFields := []string{"labels", "dependencies", "dependents", "comments"}
	for _, field := range requiredFields {
		val, exists := rawJSON[field]
		if !exists {
			t.Errorf("Field %q is missing from JSON response - should be present as empty array", field)
			continue
		}

		// Verify it's an array (not null)
		arr, ok := val.([]interface{})
		if !ok {
			t.Errorf("Field %q should be an array, got %T: %v", field, val, val)
			continue
		}

		// Verify it's empty (since we didn't add any labels/deps/comments)
		if len(arr) != 0 {
			t.Errorf("Field %q should be empty array [], got %v", field, arr)
		}
	}

	// Also verify by unmarshaling to IssueDetails struct
	var details types.IssueDetails
	if err := json.Unmarshal(showResp.Data, &details); err != nil {
		t.Fatalf("Failed to unmarshal IssueDetails: %v", err)
	}

	// Verify the slices are non-nil
	if details.Labels == nil {
		t.Error("IssueDetails.Labels should be non-nil empty slice, got nil")
	}
	if details.Dependencies == nil {
		t.Error("IssueDetails.Dependencies should be non-nil empty slice, got nil")
	}
	if details.Dependents == nil {
		t.Error("IssueDetails.Dependents should be non-nil empty slice, got nil")
	}
	if details.Comments == nil {
		t.Error("IssueDetails.Comments should be non-nil empty slice, got nil")
	}

	// Verify the slices are empty (correct length)
	if len(details.Labels) != 0 {
		t.Errorf("Expected 0 labels, got %d", len(details.Labels))
	}
	if len(details.Dependencies) != 0 {
		t.Errorf("Expected 0 dependencies, got %d", len(details.Dependencies))
	}
	if len(details.Dependents) != 0 {
		t.Errorf("Expected 0 dependents, got %d", len(details.Dependents))
	}
	if len(details.Comments) != 0 {
		t.Errorf("Expected 0 comments, got %d", len(details.Comments))
	}
}

// TestShowIssueDetailsWithData verifies that IssueDetails JSON serialization
// correctly includes non-empty arrays for labels, dependencies, dependents, and comments.
func TestShowIssueDetailsWithData(t *testing.T) {
	_, client, store, cleanup := setupTestServerWithStore(t)
	defer cleanup()

	ctx := context.Background()

	// Create two issues - one will be the main issue, one will be a dependency
	createArgs1 := &CreateArgs{
		Title:     "Main issue with data",
		IssueType: "task",
		Priority:  1,
		Labels:    []string{"test-label", "important"},
	}
	resp1, err := client.Create(createArgs1)
	if err != nil {
		t.Fatalf("Create main issue failed: %v", err)
	}
	var mainIssue types.Issue
	if err := json.Unmarshal(resp1.Data, &mainIssue); err != nil {
		t.Fatalf("Failed to unmarshal main issue: %v", err)
	}

	createArgs2 := &CreateArgs{
		Title:     "Blocking issue",
		IssueType: "task",
		Priority:  1,
	}
	resp2, err := client.Create(createArgs2)
	if err != nil {
		t.Fatalf("Create blocking issue failed: %v", err)
	}
	var blockingIssue types.Issue
	if err := json.Unmarshal(resp2.Data, &blockingIssue); err != nil {
		t.Fatalf("Failed to unmarshal blocking issue: %v", err)
	}

	// Add a dependency: mainIssue depends on blockingIssue
	dep := &types.Dependency{
		IssueID:     mainIssue.ID,
		DependsOnID: blockingIssue.ID,
		Type:        types.DepBlocks,
	}
	if err := store.AddDependency(ctx, dep, "test"); err != nil {
		t.Fatalf("Failed to add dependency: %v", err)
	}

	// Add a comment using AddIssueComment (writes to comments table, not events)
	if _, err := store.AddIssueComment(ctx, mainIssue.ID, "test-author", "This is a test comment"); err != nil {
		t.Fatalf("Failed to add comment: %v", err)
	}

	// Show the main issue
	showArgs := &ShowArgs{ID: mainIssue.ID}
	showResp, err := client.Show(showArgs)
	if err != nil {
		t.Fatalf("Show failed: %v", err)
	}
	if !showResp.Success {
		t.Fatalf("Show returned error: %s", showResp.Error)
	}

	// Parse the raw JSON to verify structure
	var rawJSON map[string]interface{}
	if err := json.Unmarshal(showResp.Data, &rawJSON); err != nil {
		t.Fatalf("Failed to unmarshal raw JSON: %v", err)
	}

	// Verify all required fields are present and are arrays
	t.Run("labels_field_present", func(t *testing.T) {
		val, exists := rawJSON["labels"]
		if !exists {
			t.Fatal("Field 'labels' is missing from JSON response")
		}
		arr, ok := val.([]interface{})
		if !ok {
			t.Fatalf("Field 'labels' should be an array, got %T", val)
		}
		if len(arr) != 2 {
			t.Errorf("Expected 2 labels, got %d", len(arr))
		}
	})

	t.Run("dependencies_field_present", func(t *testing.T) {
		val, exists := rawJSON["dependencies"]
		if !exists {
			t.Fatal("Field 'dependencies' is missing from JSON response")
		}
		arr, ok := val.([]interface{})
		if !ok {
			t.Fatalf("Field 'dependencies' should be an array, got %T", val)
		}
		if len(arr) != 1 {
			t.Errorf("Expected 1 dependency, got %d", len(arr))
		}
	})

	t.Run("dependents_field_present", func(t *testing.T) {
		val, exists := rawJSON["dependents"]
		if !exists {
			t.Fatal("Field 'dependents' is missing from JSON response")
		}
		arr, ok := val.([]interface{})
		if !ok {
			t.Fatalf("Field 'dependents' should be an array, got %T", val)
		}
		// mainIssue has no dependents (nothing depends on it)
		if len(arr) != 0 {
			t.Errorf("Expected 0 dependents, got %d", len(arr))
		}
	})

	t.Run("comments_field_present", func(t *testing.T) {
		val, exists := rawJSON["comments"]
		if !exists {
			t.Fatal("Field 'comments' is missing from JSON response")
		}
		arr, ok := val.([]interface{})
		if !ok {
			t.Fatalf("Field 'comments' should be an array, got %T", val)
		}
		if len(arr) != 1 {
			t.Errorf("Expected 1 comment, got %d", len(arr))
		}
	})

	// Unmarshal to IssueDetails to verify typed structure
	var details types.IssueDetails
	if err := json.Unmarshal(showResp.Data, &details); err != nil {
		t.Fatalf("Failed to unmarshal IssueDetails: %v", err)
	}

	// Verify non-nil slices
	if details.Labels == nil {
		t.Error("IssueDetails.Labels should be non-nil")
	}
	if details.Dependencies == nil {
		t.Error("IssueDetails.Dependencies should be non-nil")
	}
	if details.Dependents == nil {
		t.Error("IssueDetails.Dependents should be non-nil")
	}
	if details.Comments == nil {
		t.Error("IssueDetails.Comments should be non-nil")
	}

	// Verify correct counts
	if len(details.Labels) != 2 {
		t.Errorf("Expected 2 labels, got %d", len(details.Labels))
	}
	if len(details.Dependencies) != 1 {
		t.Errorf("Expected 1 dependency, got %d", len(details.Dependencies))
	}
	if len(details.Dependents) != 0 {
		t.Errorf("Expected 0 dependents, got %d", len(details.Dependents))
	}
	if len(details.Comments) != 1 {
		t.Errorf("Expected 1 comment, got %d", len(details.Comments))
	}
}

// TestIssueDetailsJSONSerialization tests that types.IssueDetails serializes
// with empty arrays (not null or omitted) for slice fields (GH#bd-rrtu).
func TestIssueDetailsJSONSerialization(t *testing.T) {
	// Create an IssueDetails with explicit empty slices
	details := types.IssueDetails{
		Issue: types.Issue{
			ID:        "test-1",
			Title:     "Test issue",
			Status:    types.StatusOpen,
			Priority:  2,
			IssueType: types.TypeTask,
		},
		Labels:       []string{},
		Dependencies: []*types.IssueWithDependencyMetadata{},
		Dependents:   []*types.IssueWithDependencyMetadata{},
		Comments:     []*types.Comment{},
	}

	// Serialize to JSON
	data, err := json.Marshal(details)
	if err != nil {
		t.Fatalf("Failed to marshal IssueDetails: %v", err)
	}

	// Parse as raw JSON to check structure
	var rawJSON map[string]interface{}
	if err := json.Unmarshal(data, &rawJSON); err != nil {
		t.Fatalf("Failed to unmarshal raw JSON: %v", err)
	}

	// Verify fields are present as empty arrays
	requiredFields := []string{"labels", "dependencies", "dependents", "comments"}
	for _, field := range requiredFields {
		val, exists := rawJSON[field]
		if !exists {
			t.Errorf("Field %q should be present in JSON, but was omitted", field)
			continue
		}

		arr, ok := val.([]interface{})
		if !ok {
			t.Errorf("Field %q should be array, got %T: %v", field, val, val)
			continue
		}

		if len(arr) != 0 {
			t.Errorf("Field %q should be empty array [], got length %d", field, len(arr))
		}
	}

	// Verify the JSON string contains the fields as empty arrays
	jsonStr := string(data)
	expectedPatterns := []string{
		`"labels":[]`,
		`"dependencies":[]`,
		`"dependents":[]`,
		`"comments":[]`,
	}
	for _, pattern := range expectedPatterns {
		if !contains(jsonStr, pattern) {
			t.Errorf("Expected JSON to contain %q, but it doesn't. JSON: %s", pattern, jsonStr)
		}
	}
}

// TestIssueDetailsJSONWithNilSlices tests behavior when IssueDetails has nil slices.
// This verifies that nil slices become JSON null (which is the default behavior).
// The handleShow function ensures this never happens by initializing empty slices.
func TestIssueDetailsJSONWithNilSlices(t *testing.T) {
	// Create an IssueDetails with nil slices (the problematic case we're preventing)
	details := types.IssueDetails{
		Issue: types.Issue{
			ID:        "test-2",
			Title:     "Test issue with nil slices",
			Status:    types.StatusOpen,
			Priority:  2,
			IssueType: types.TypeTask,
		},
		Labels:       nil,
		Dependencies: nil,
		Dependents:   nil,
		Comments:     nil,
	}

	// Serialize to JSON
	data, err := json.Marshal(details)
	if err != nil {
		t.Fatalf("Failed to marshal IssueDetails: %v", err)
	}

	// Parse as raw JSON to check structure
	var rawJSON map[string]interface{}
	if err := json.Unmarshal(data, &rawJSON); err != nil {
		t.Fatalf("Failed to unmarshal raw JSON: %v", err)
	}

	// With omitempty removed from the struct tags, nil slices serialize as null (not omitted)
	// This test documents the current behavior
	requiredFields := []string{"labels", "dependencies", "dependents", "comments"}
	for _, field := range requiredFields {
		val, exists := rawJSON[field]
		if !exists {
			t.Errorf("Field %q should be present (not omitted) even when nil - omitempty was removed", field)
			continue
		}

		// nil slices serialize as JSON null
		if val != nil {
			t.Errorf("Field %q with nil slice should serialize as null, got %T: %v", field, val, val)
		}
	}
}

// contains checks if a string contains a substring
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
