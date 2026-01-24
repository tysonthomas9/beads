package main

import "testing"

func TestDisplayWidth(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected int
	}{
		{"ascii", "hello", 5},
		{"unicode checkmark", "✓ clean", 7},
		{"unicode bullet", "● running", 9},
		{"unicode arrows", "↑1 ↓2", 5},
		{"empty", "", 0},
		{"mixed", "abc123", 6},
		{"spaces", "   ", 3},
		{"single char", "x", 1},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := displayWidth(tc.input)
			if got != tc.expected {
				t.Errorf("displayWidth(%q) = %d, want %d", tc.input, got, tc.expected)
			}
		})
	}
}

func TestTruncateString(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		maxLen   int
		expected string
	}{
		{"no truncation", "hello", 10, "hello"},
		{"truncate with ellipsis", "hello world", 8, "hello..."},
		{"exact length", "short", 5, "short"},
		{"shorter than max", "ab", 5, "ab"},
		{"truncate to minimum", "abcdefghij", 4, "a..."},
		{"empty string", "", 5, ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := truncateString(tc.input, tc.maxLen)
			if got != tc.expected {
				t.Errorf("truncateString(%q, %d) = %q, want %q",
					tc.input, tc.maxLen, got, tc.expected)
			}
		})
	}
}

func TestRenderBoxTop(t *testing.T) {
	result := renderBoxTop(10)
	if result != "╔════════╗\n" {
		t.Errorf("renderBoxTop(10) = %q, want %q", result, "╔════════╗\n")
	}
}

func TestRenderBoxBottom(t *testing.T) {
	result := renderBoxBottom(10)
	if result != "╚════════╝\n" {
		t.Errorf("renderBoxBottom(10) = %q, want %q", result, "╚════════╝\n")
	}
}

func TestRenderBoxSeparator(t *testing.T) {
	result := renderBoxSeparator(10)
	if result != "╠════════╣\n" {
		t.Errorf("renderBoxSeparator(10) = %q, want %q", result, "╠════════╣\n")
	}
}

func TestCenterText(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		width    int
		expected string
	}{
		{"center short text", "hi", 10, "    hi    "},
		{"text equals width", "hello", 5, "hello"},
		{"text longer than width", "hello world", 5, "hello world"},
		{"empty text", "", 5, "     "},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := centerText(tc.text, tc.width)
			if got != tc.expected {
				t.Errorf("centerText(%q, %d) = %q, want %q",
					tc.text, tc.width, got, tc.expected)
			}
		})
	}
}
