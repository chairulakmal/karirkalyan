# Web Push subscription management — SPEC.md § Push notifications. All three
# actions are authenticated; the browser-side ceremony that produces the
# subscription lives on /settings (SPEC.md § The service worker).
module Api
  module V1
    class PushSubscriptionsController < ApplicationController
      before_action :require_vapid, only: [ :public_key, :create ]

      # GET /api/v1/push_subscriptions/public_key
      #
      # Served rather than duplicated into a web-side env var: two services
      # sharing a key by copy is drift waiting to happen.
      def public_key
        render json: { public_key: PushVapid.public_key }
      end

      # POST /api/v1/push_subscriptions
      #
      # Upsert on endpoint: a push endpoint identifies one browser profile, so
      # a re-subscription updates keys in place and ownership follows the
      # session that registered it last.
      def create
        subscription = PushSubscription.find_or_initialize_by(endpoint: subscription_params[:endpoint])
        subscription.assign_attributes(
          user:   current_user,
          p256dh: subscription_params[:p256dh],
          auth:   subscription_params[:auth]
        )

        if subscription.save
          render json: subscription, status: :created
        else
          render_validation_failed(subscription)
        end
      end

      # DELETE /api/v1/push_subscriptions — by endpoint, idempotent: the state
      # the caller asked for (this browser is not subscribed) is the state
      # that obtains either way, so an unknown endpoint is a 204, not a 404.
      def destroy
        current_user.push_subscriptions.find_by(endpoint: params[:endpoint].to_s)&.destroy!
        head :no_content
      end

      private

      def subscription_params
        subscription = params.require(:subscription)
        {
          endpoint: subscription[:endpoint].to_s,
          # The browser's PushSubscription.toJSON nests the crypto keys.
          p256dh:   subscription.dig(:keys, :p256dh).to_s,
          auth:     subscription.dig(:keys, :auth).to_s
        }
      end

      def require_vapid
        return if PushVapid.configured?

        render_error("Push notifications are not configured on this server.",
                     code: "push_unavailable", status: :service_unavailable)
      end
    end
  end
end
