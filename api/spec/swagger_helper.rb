require "rails_helper"

RSpec.configure do |config|
  config.openapi_root = Rails.root.join("swagger").to_s

  config.openapi_specs = {
    "v1/swagger.yaml" => {
      openapi: "3.0.1",
      info: {
        title: "KarirKalyan API",
        version: "v1",
        description: "Job application tracker API — Rails 8, Devise + JWT"
      },
      # The production server is the *API* service, not kk.chairulakmal.com — that is the
      # Next.js app, which has no /api/v1 routes, so "Try it out" against it 404s.
      servers: [
        { url: "http://localhost:3001", description: "Local development" },
        { url: "https://api-production-4899.up.railway.app", description: "Production" }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: :http,
            scheme: :bearer,
            bearerFormat: "JWT",
            description: "JWT issued on sign-in. Pass as: Authorization: Bearer <token>"
          }
        }
      }
    }
  }

  config.openapi_format = :yaml
end
