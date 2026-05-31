module Api
  module V1
    # Returns the authenticated user's own profile. The foundation for a
    # profile section — currently email + timestamps; safe to extend later.
    # User#as_json already strips encrypted_password and jti.
    class MeController < ApplicationController
      def show
        render json: current_user
      end
    end
  end
end
