-- Registration selfie + required phone:
-- profile_photo_key stores the R2/S3 object key for the photo captured at signup.
-- phone is collected at registration so admins can contact the guard.
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_key text;
