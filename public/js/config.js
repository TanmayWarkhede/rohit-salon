// Single source of truth for defaults. Admin > Settings (Firestore salon/settings) overrides these.
export const salonConfig = {
  name: "The Rohit Salon",
  tagline: "Look Good, Feel Confident",
  phone: "+91 87883 57199",
  whatsappNumber: "918788357199",
  email: "",
  address: "Magar Plaza, Dhule Road, JJ Anna Nagar, Chalisgaon, Maharashtra",
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Magar+Plaza+Dhule+Road+Chalisgaon",
  instagramUrl: "", facebookUrl: "", youtubeUrl: "",
  currency: "INR", timezoneOffset: "+05:30",
  booking: { slotMinutes: 30, breakStart: "", breakEnd: "", maxDaysAhead: 30, holidays: [] },
  busy: false, // true = online booking paused (switch in Admin > Dashboard)
  // 0 = Sunday. Monday closed; every other day 7 AM to 10 PM. Change anytime in Admin > Settings.
  hours: {
    0: { open: "07:00", close: "22:00" }, 1: { closed: true }, 2: { open: "07:00", close: "22:00" },
    3: { open: "07:00", close: "22:00" }, 4: { open: "07:00", close: "22:00" },
    5: { open: "07:00", close: "22:00" }, 6: { open: "07:00", close: "22:00" }
  }
};
export const images = {
  logo: "assets/images/branding/logo.png",
  hero: "assets/images/banners/hero-banner.png",
  interior: "assets/images/salon/salon-interior.png",
  front: "assets/images/salon/salon-front.png",
  station: "assets/images/salon/salon-styling-station.png",
  priceCards: ["assets/images/services/price-card-hair.png", "assets/images/services/price-card-skin-wellness.png"]
};
