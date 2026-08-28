output "state_bucket" {
  value = aws_s3_bucket.terraform_state.id
}

output "lock_table" {
  value = aws_dynamodb_table.terraform_locks.name
}

output "github_role_arn" {
  value = aws_iam_role.github.arn
}
