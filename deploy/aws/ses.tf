# Outgoing email through Amazon SES (mail.transport = "ses"). The auth function calls the SES API with
# its IAM role, so there are no SMTP credentials to create or store.
#
# ses_identity is what SES will let you send from:
#   - an email address (alice@example.com): SES emails that address a confirmation link; click it once.
#   - a domain (example.com): add the three DKIM CNAME records from the `ses_dkim_records` output to its
#     DNS; then any address on the domain works as mail.from.
# A new SES account is in "sandbox" mode: it only delivers to verified addresses, 200 mails a day. Ask AWS
# for production access (SES console > Account dashboard > Request production access) to mail anyone.

locals {
  ses_enabled = nonsensitive(var.mail.transport) == "ses"
}

resource "aws_sesv2_email_identity" "from" {
  count          = local.ses_enabled && var.ses_identity != "" ? 1 : 0
  email_identity = var.ses_identity
}

data "aws_iam_policy_document" "lambda_ses" {
  count = local.ses_enabled ? 1 : 0
  statement {
    actions   = ["ses:SendEmail"]
    resources = length(aws_sesv2_email_identity.from) > 0 ? [aws_sesv2_email_identity.from[0].arn] : ["*"]
  }
}

resource "aws_iam_role_policy" "lambda_ses" {
  count  = local.ses_enabled && !var.use_managed_iam_policies ? 1 : 0
  name   = "send-email"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_ses[0].json
}

# Sandboxes that deny inline role policies: the broader AWS-managed policy.
resource "aws_iam_role_policy_attachment" "lambda_ses_managed" {
  count      = local.ses_enabled && var.use_managed_iam_policies ? 1 : 0
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSESFullAccess"
}

output "ses_dkim_records" {
  description = "For a domain identity: create these three CNAME records in its DNS (name => value)."
  value = try({
    for t in aws_sesv2_email_identity.from[0].dkim_signing_attributes[0].tokens :
    "${t}._domainkey.${var.ses_identity}" => "${t}.dkim.amazonses.com"
  }, {})
}
