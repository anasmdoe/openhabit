output "instance_id" {
  value = aws_instance.runner.id
}

output "github_token_secret" {
  description = "Put the GitHub token here before (or right after) the first boot; see the README."
  value       = aws_secretsmanager_secret.github_token.name
}

output "runner_labels" {
  value = local.labels
}

output "shell_access" {
  value = "aws ssm start-session --target ${aws_instance.runner.id}"
}
