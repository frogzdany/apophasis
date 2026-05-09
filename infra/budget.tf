# Budget + email alerts for the apophasis project.
#
# Sends email at 50/90/100% of var.budget_amount and again on forecast >100%.
# The budget is non-enforcing (Google budgets can't auto-shut-off services);
# pair it with quota caps on the Gemini API key for hard protection.

resource "google_project_service" "budgets" {
  service            = "billingbudgets.googleapis.com"
  disable_on_destroy = false
}

data "google_project" "this" {
  project_id = var.project_id
}

resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account
  display_name    = "${var.service_name} monthly cap"

  budget_filter {
    # Budget API expects the project *number*, not the ID.
    projects = ["projects/${data.google_project.this.number}"]
    # Leave services unset to cover everything in the project (Cloud Run +
    # Gemini API + storage + egress). If you want to budget only GCP infra
    # and exclude Gemini, set `services` to specific service IDs.
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = tostring(var.budget_amount)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 0.9
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  # No `all_updates_rule` block → Google falls back to its default
  # behavior: emails go to billing-account admins/owners (i.e. you, since
  # var.notification_email owns this billing account) on each
  # threshold_rule trigger.

  depends_on = [google_project_service.budgets]
}
