# Well-formed Web Push values. PushSubscription checks the endpoint host and
# the key sizes, so placeholder strings no longer save.
module PushKeys
  module_function

  def endpoint(suffix = SecureRandom.hex(8))
    "https://fcm.googleapis.com/fcm/send/#{suffix}"
  end

  def p256dh
    Base64.urlsafe_encode64("\x04".b + SecureRandom.random_bytes(64), padding: false)
  end

  def auth
    Base64.urlsafe_encode64(SecureRandom.random_bytes(16), padding: false)
  end
end
