package main

import (
	"testing"
	"time"
)

func validInput() lessonInput {
	return lessonInput{
		Date:   time.Now().UTC().Format("2006-01-02"),
		Lesson: "NT 7 – Test",
		Before: measurementInput{CO2PPM: 518, TemperatureC: 23.8},
		After:  measurementInput{CO2PPM: 575, TemperatureC: 23.9},
	}
}

func TestValidateLessonAcceptsClassroomMeasurements(t *testing.T) {
	if err := validateLesson(validInput()); err != nil {
		t.Fatalf("expected valid input, got %v", err)
	}
}

func TestValidateLessonRejectsImplausibleCO2(t *testing.T) {
	input := validInput()
	input.After.CO2PPM = 12000
	if err := validateLesson(input); err == nil {
		t.Fatal("expected invalid CO2 value to be rejected")
	}
}

func TestTokensMatch(t *testing.T) {
	if !tokensMatch("same-secret", "same-secret") {
		t.Fatal("expected identical tokens to match")
	}
	if tokensMatch("wrong", "same-secret") {
		t.Fatal("expected different tokens not to match")
	}
}
