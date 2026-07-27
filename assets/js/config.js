const CONFIG = Object.freeze({
  VERSION: "2.1.1",
  API_URL: "https://script.google.com/macros/s/AKfycbyZuNSOT2SCW6YNp6gZ-bTO6gfm9wGI3-YAjvSmo5oelcqrUmARNzmd49hbjSn4ISh4Yg/exec",
  SESSION_KEY: "fdi_ascolta_ix_session_v2",
  CLIENT_ID_KEY: "fdi_ascolta_ix_client_v1",
  NOTIFICATION_READ_KEY: "fdi_crm_notifications_read_v2",
  MAX_PHOTO_BYTES: 5 * 1024 * 1024,
  RECAPTCHA_REQUIRED: true,
  COORD_BOUNDS: Object.freeze({
    minLat: 41.65,
    maxLat: 42.05,
    minLng: 12.25,
    maxLng: 12.75
  })
});
