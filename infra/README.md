# AWS- und Deployment-Hinweise

## Einmalige Einrichtung

```bash
cd infra/bootstrap
terraform init
terraform apply
```

Danach werden die GitHub-Variablen `AWS_ROLE_ARN` und `AWS_REGION` gesetzt. Der eigentliche Stack verwendet den verschlüsselten Remote-State aus `backend.hcl`.

## Anwendung manuell veröffentlichen

```bash
cd backend
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -o bootstrap ./cmd/api
zip -j lambda.zip bootstrap

cd ../infra
terraform init -backend-config=backend.hcl
terraform apply

cd ../frontend
VITE_API_URL="$(terraform -chdir=../infra output -raw api_url)" npm run build
aws s3 sync dist/ "s3://$(terraform -chdir=../infra output -raw site_bucket)" --delete
aws cloudfront create-invalidation --distribution-id "$(terraform -chdir=../infra output -raw cloudfront_distribution_id)" --paths '/*'
```

Der geheime Eingabecode kann lokal mit `terraform -chdir=infra output -raw write_token` ausgelesen werden. Er wird nicht in GitHub gespeichert.
