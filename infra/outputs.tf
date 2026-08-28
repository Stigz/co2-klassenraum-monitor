output "api_url" {
  description = "Öffentliche Basis-URL der Go-API."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "site_bucket" {
  description = "S3-Bucket für den gebauten React-Stand."
  value       = aws_s3_bucket.site.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront-Verteilung für Cache-Invalidierungen."
  value       = aws_cloudfront_distribution.site.id
}

output "website_url" {
  description = "Öffentliche HTTPS-Adresse der Webseite."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "write_token" {
  description = "Geheimer Eingabecode für neue Lektionen."
  value       = random_password.write_token.result
  sensitive   = true
}
