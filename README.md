# CO₂-Klassenraum-Monitor

Eine kleine Webseite für die langfristige Beobachtung von CO₂-Konzentration und Temperatur im Schulzimmer. Pro Lektion werden je eine Messung **vor** und **nach** dem Unterricht gespeichert und in einer gemeinsamen Zeitreihe dargestellt.

**Live:** [Luft im Schulzimmer](https://d232kpzqod5eed.cloudfront.net)

## Startdaten

| Zeitpunkt | CO₂ | Temperatur |
|---|---:|---:|
| Vor der Lektion | 518 ppm | 23,8 °C |
| Nach der Lektion | 575 ppm | 23,9 °C |

## Aufbau

- **React + TypeScript** für die deutschsprachige Oberfläche und die Grafik
- **Go** als schlanke AWS-Lambda-API
- **DynamoDB** für die dauerhafte Speicherung der Messungen
- **S3 + CloudFront** für die schnelle, verschlüsselte Auslieferung der Webseite
- **API Gateway** als HTTPS-Zugang zur Go-API
- **Terraform** für die gesamte AWS-Infrastruktur
- **GitHub Actions + OIDC** für Deployments ohne dauerhaft gespeicherte AWS-Schlüssel

Die Anzeige ist öffentlich lesbar. Neue Messungen können nur mit dem beim ersten Deployment erzeugten Eingabecode gespeichert werden.

## Lokal starten

Voraussetzungen: Node.js 22 und Go 1.26 oder neuer.

```bash
cd frontend
npm install
npm run dev
```

Ohne laufende AWS-API zeigt die lokale Oberfläche die beiden Startmessungen als Vorschau an.

## Tests und Builds

```bash
cd frontend && npm test && npm run build
cd ../backend && go test ./...
```

## Infrastruktur

`infra/bootstrap` erstellt einmalig den verschlüsselten Terraform-State und die eng auf dieses Projekt begrenzte GitHub-Rolle. `infra` enthält die eigentliche Anwendung. Pushes auf `main` testen, bauen und veröffentlichen die Anwendung automatisch.

Die konkreten Befehle und die Architektur sind unter [`infra/README.md`](infra/README.md) dokumentiert.
