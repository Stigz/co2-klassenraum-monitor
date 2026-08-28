data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  resource_prefix = "${var.project_name}-${var.environment}"
  bucket_name     = "${local.resource_prefix}-${data.aws_caller_identity.current.account_id}"
}

resource "random_password" "write_token" {
  length  = 20
  special = false
}

resource "aws_dynamodb_table" "readings" {
  name         = "${local.resource_prefix}-readings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table_item" "seed_before" {
  table_name = aws_dynamodb_table.readings.name
  hash_key   = aws_dynamodb_table.readings.hash_key

  item = jsonencode({
    id           = { S = "2026-08-28-start-vor" }
    date         = { S = "2026-08-28" }
    lesson       = { S = "Startmessung" }
    phase        = { S = "before" }
    co2Ppm       = { N = "518" }
    temperatureC = { N = "23.8" }
    sortOrder    = { N = "100" }
    createdAt    = { S = "2026-08-28T08:00:00Z" }
  })
}

resource "aws_dynamodb_table_item" "seed_after" {
  table_name = aws_dynamodb_table.readings.name
  hash_key   = aws_dynamodb_table.readings.hash_key

  item = jsonencode({
    id           = { S = "2026-08-28-start-nach" }
    date         = { S = "2026-08-28" }
    lesson       = { S = "Startmessung" }
    phase        = { S = "after" }
    co2Ppm       = { N = "575" }
    temperatureC = { N = "23.9" }
    sortOrder    = { N = "101" }
    createdAt    = { S = "2026-08-28T09:30:00Z" }
  })
}

resource "aws_iam_role" "lambda" {
  name = "${local.resource_prefix}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lambda" {
  name = "${local.resource_prefix}-lambda"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadAndWriteMeasurements"
        Effect   = "Allow"
        Action   = ["dynamodb:Scan", "dynamodb:PutItem", "dynamodb:TransactWriteItems"]
        Resource = aws_dynamodb_table.readings.arn
      },
      {
        Sid      = "WriteLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.api.arn}:*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.resource_prefix}-api"
  retention_in_days = 14
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.resource_prefix}-api"
  role             = aws_iam_role.lambda.arn
  handler          = "bootstrap"
  runtime          = "provided.al2023"
  architectures    = ["arm64"]
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.readings.name
      WRITE_TOKEN = random_password.write_token.result
    }
  }

  depends_on = [aws_cloudwatch_log_group.api]
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${local.resource_prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["content-type", "x-write-token"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_origins = ["*"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 10000
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "readings" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /readings"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "lessons" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /lessons"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "production" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 10
    throttling_rate_limit  = 5
  }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_s3_bucket" "site" {
  bucket        = local.bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = local.resource_prefix
  description                       = "Privater Zugriff auf die Klassenraum-Webseite"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CO2-Klassenraum-Monitor"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  wait_for_deployment = true

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "site-bucket"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "site-bucket"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }
}

data "aws_iam_policy_document" "site" {
  statement {
    sid     = "AllowCloudFrontRead"
    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.site.arn}/*"
    ]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site.json
}
