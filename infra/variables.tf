variable "project_name" {
  description = "Kurzer Name für alle AWS-Ressourcen."
  type        = string
  default     = "co2-klassenraum-monitor"
}

variable "environment" {
  description = "Name der Umgebung."
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS-Region für Lambda, DynamoDB und S3."
  type        = string
  default     = "eu-central-1"
}

variable "lambda_zip_path" {
  description = "Pfad zum bereits für Linux ARM64 gebauten Lambda-ZIP."
  type        = string
  default     = "../backend/lambda.zip"
}
