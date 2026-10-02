// SAMPLE DATA taken from your price cards. Verify before use. Paste each object into Firestore "services" (Admin > Services in a later phase).
export const sampleServices = [
 {name:"Hair Cut",category:"Hair",price:100,onlinePrice:120,duration:30,description:"Offline ₹100, online booking ₹120",active:true,featured:true},
 {name:"Beard",category:"Hair",price:50,duration:15,description:"Beard trim and shape",active:true,featured:true},
 {name:"Kids Hair Cut",category:"Hair",price:60,duration:30,description:"",active:true,featured:false},
 {name:"Hair Wash",category:"Hair",price:50,duration:15,description:"",active:true,featured:false},
 {name:"Hair Wash & Styling",category:"Hair",price:100,duration:30,description:"",active:true,featured:false},
 {name:"Hair Colour",category:"Hair",price:100,startingPrice:true,duration:45,description:"Starting price",active:true,featured:false},
 {name:"Hair Spa",category:"Hair",price:350,duration:45,description:"",active:true,featured:true},
 {name:"Head Massage",category:"Massage",price:80,duration:20,description:"",active:true,featured:false},
 {name:"Hair Massage",category:"Massage",price:100,duration:30,description:"",active:true,featured:false},
 {name:"De Tan Pack & Massage",category:"Skin Care",price:250,duration:30,description:"",active:true,featured:false},
 {name:"De Tan Cleanup",category:"Skin Care",price:450,duration:45,description:"",active:true,featured:false},
 {name:"Regular Cleanup",category:"Skin Care",price:350,duration:40,description:"",active:true,featured:false},
 {name:"Facial Regular",category:"Skin Care",price:700,startingPrice:true,duration:45,description:"",active:true,featured:false},
 {name:"O3 Plus Facial",category:"Skin Care",price:1600,startingPrice:true,duration:60,description:"Hair cut and beard free",active:true,featured:false},
 {name:"Scrub",category:"Face & Body",price:100,duration:20,description:"",active:true,featured:false},
 {name:"Scrub & Massage",category:"Face & Body",price:200,duration:30,description:"",active:true,featured:false}
];
