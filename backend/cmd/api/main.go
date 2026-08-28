package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type reading struct {
	ID           string  `json:"id" dynamodbav:"id"`
	Date         string  `json:"date" dynamodbav:"date"`
	Lesson       string  `json:"lesson" dynamodbav:"lesson"`
	Phase        string  `json:"phase" dynamodbav:"phase"`
	CO2PPM       int     `json:"co2Ppm" dynamodbav:"co2Ppm"`
	TemperatureC float64 `json:"temperatureC" dynamodbav:"temperatureC"`
	SortOrder    int64   `json:"sortOrder" dynamodbav:"sortOrder"`
	CreatedAt    string  `json:"createdAt" dynamodbav:"createdAt"`
}

type measurementInput struct {
	CO2PPM       int     `json:"co2Ppm"`
	TemperatureC float64 `json:"temperatureC"`
}

type lessonInput struct {
	Date   string           `json:"date"`
	Lesson string           `json:"lesson"`
	Before measurementInput `json:"before"`
	After  measurementInput `json:"after"`
}

type api struct {
	db         *dynamodb.Client
	tableName  string
	writeToken string
}

func main() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("AWS-Konfiguration konnte nicht geladen werden: %v", err)
	}

	service := &api{
		db:         dynamodb.NewFromConfig(cfg),
		tableName:  os.Getenv("TABLE_NAME"),
		writeToken: os.Getenv("WRITE_TOKEN"),
	}
	if service.tableName == "" || service.writeToken == "" {
		log.Fatal("TABLE_NAME und WRITE_TOKEN müssen gesetzt sein")
	}

	lambda.Start(service.handle)
}

func (a *api) handle(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	switch {
	case request.RequestContext.HTTP.Method == http.MethodGet && request.RawPath == "/health":
		return jsonResponse(http.StatusOK, map[string]string{"status": "ok"})
	case request.RequestContext.HTTP.Method == http.MethodGet && request.RawPath == "/readings":
		return a.listReadings(ctx)
	case request.RequestContext.HTTP.Method == http.MethodPost && request.RawPath == "/lessons":
		return a.createLesson(ctx, request)
	default:
		return jsonResponse(http.StatusNotFound, map[string]string{"message": "Route nicht gefunden"})
	}
}

func (a *api) listReadings(ctx context.Context) (events.APIGatewayV2HTTPResponse, error) {
	items := make([]reading, 0)
	paginator := dynamodb.NewScanPaginator(a.db, &dynamodb.ScanInput{TableName: aws.String(a.tableName)})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			log.Printf("Messungen konnten nicht gelesen werden: %v", err)
			return jsonResponse(http.StatusInternalServerError, map[string]string{"message": "Messungen konnten nicht geladen werden"})
		}
		var pageItems []reading
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &pageItems); err != nil {
			log.Printf("Messungen konnten nicht dekodiert werden: %v", err)
			return jsonResponse(http.StatusInternalServerError, map[string]string{"message": "Messungen konnten nicht geladen werden"})
		}
		items = append(items, pageItems...)
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Date == items[j].Date {
			return items[i].SortOrder < items[j].SortOrder
		}
		return items[i].Date < items[j].Date
	})

	return jsonResponse(http.StatusOK, items)
}

func (a *api) createLesson(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	providedToken := header(request.Headers, "x-write-token")
	if !tokensMatch(providedToken, a.writeToken) {
		return jsonResponse(http.StatusUnauthorized, map[string]string{"message": "Der Eingabecode ist nicht korrekt"})
	}

	var input lessonInput
	decoder := json.NewDecoder(strings.NewReader(request.Body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return jsonResponse(http.StatusBadRequest, map[string]string{"message": "Die Eingaben konnten nicht gelesen werden"})
	}
	input.Lesson = strings.TrimSpace(input.Lesson)
	if err := validateLesson(input); err != nil {
		return jsonResponse(http.StatusBadRequest, map[string]string{"message": err.Error()})
	}

	now := time.Now().UTC()
	baseOrder := now.UnixMilli() * 10
	readings := []reading{
		newReading(input.Date, input.Lesson, "before", input.Before, baseOrder, now),
		newReading(input.Date, input.Lesson, "after", input.After, baseOrder+1, now),
	}

	writeItems := make([]types.TransactWriteItem, 0, len(readings))
	for _, item := range readings {
		marshalled, err := attributevalue.MarshalMap(item)
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		writeItems = append(writeItems, types.TransactWriteItem{Put: &types.Put{
			TableName:           aws.String(a.tableName),
			Item:                marshalled,
			ConditionExpression: aws.String("attribute_not_exists(id)"),
		}})
	}

	if _, err := a.db.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: writeItems}); err != nil {
		log.Printf("Lektion konnte nicht gespeichert werden: %v", err)
		return jsonResponse(http.StatusInternalServerError, map[string]string{"message": "Die Lektion konnte nicht gespeichert werden"})
	}

	return jsonResponse(http.StatusCreated, readings)
}

func newReading(date, lesson, phase string, measurement measurementInput, order int64, now time.Time) reading {
	return reading{
		ID:           randomID(),
		Date:         date,
		Lesson:       lesson,
		Phase:        phase,
		CO2PPM:       measurement.CO2PPM,
		TemperatureC: measurement.TemperatureC,
		SortOrder:    order,
		CreatedAt:    now.Format(time.RFC3339),
	}
}

func validateLesson(input lessonInput) error {
	parsedDate, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		return errors.New("Bitte ein gültiges Datum wählen")
	}
	if parsedDate.Before(time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)) || parsedDate.After(time.Now().UTC().AddDate(1, 0, 0)) {
		return errors.New("Das Datum liegt ausserhalb des erlaubten Bereichs")
	}
	if len(input.Lesson) < 1 || len(input.Lesson) > 80 {
		return errors.New("Die Lektionsbezeichnung muss 1 bis 80 Zeichen lang sein")
	}
	if err := validateMeasurement("Vor der Lektion", input.Before); err != nil {
		return err
	}
	return validateMeasurement("Nach der Lektion", input.After)
}

func validateMeasurement(label string, value measurementInput) error {
	if value.CO2PPM < 300 || value.CO2PPM > 10000 {
		return errors.New(label + ": CO₂ muss zwischen 300 und 10'000 ppm liegen")
	}
	if value.TemperatureC < -10 || value.TemperatureC > 50 {
		return errors.New(label + ": Temperatur muss zwischen −10 und 50 °C liegen")
	}
	return nil
}

func header(headers map[string]string, name string) string {
	for key, value := range headers {
		if strings.EqualFold(key, name) {
			return value
		}
	}
	return ""
}

func tokensMatch(provided, expected string) bool {
	if provided == "" || expected == "" || len(provided) != len(expected) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}

func randomID() string {
	buffer := make([]byte, 12)
	if _, err := rand.Read(buffer); err != nil {
		return hex.EncodeToString([]byte(time.Now().UTC().Format(time.RFC3339Nano)))
	}
	return hex.EncodeToString(buffer)
}

func jsonResponse(status int, body any) (events.APIGatewayV2HTTPResponse, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return events.APIGatewayV2HTTPResponse{
		StatusCode: status,
		Headers: map[string]string{
			"content-type":              "application/json; charset=utf-8",
			"cache-control":             "no-store",
			"x-content-type-options":    "nosniff",
			"strict-transport-security": "max-age=31536000; includeSubDomains",
			"content-security-policy":   "default-src 'none'; frame-ancestors 'none'",
			"referrer-policy":           "no-referrer",
			"permissions-policy":        "camera=(), microphone=(), geolocation=()",
		},
		Body: string(payload),
	}, nil
}
