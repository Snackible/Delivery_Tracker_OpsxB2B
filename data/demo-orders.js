// Demo fallback: the real order rows from the BD Ops Sales Tracking Sheet (Sheet1) as of 14/10/2026.
// Used only when no Google credentials are configured, so the app can run locally.
// Columns: date, poc, ref, client, kind, products, expected, opsDate, status
const MAIL = "Mentioned in mail";
const NO_CLUE = "No clue as Aditi's investor order";
const COMPASS = "COMPASS INDIA FOOD SERVICES PRIVATE LIMITED";
const HOULIHAN = "HOULIHAN LOKEY ADVISORY (INDIA) PRIVATE LIMITED";
const INNO = "INNOMOTIVE SOLUTIONS PRIVATE LIMITED";
const VIKAS = "VIKAS TELECOM PRIVATE LIMITED";
const AMPL = "AMPL Resources Pvt. Ltd.";
const JUST = "Just Udo Aviation Private Limited";
const NAMRUP = "Namrup Technologies Pvt Ltd";
const VEGA = "Vega Inventures";

const rows = [
  ["08/09/2026", "Prabhnoor", "Sep26-879", "Archit Gupta", "", MAIL, NO_CLUE, "", "Delivered"],
  ["16/09/2026", "Dhyana", "Sep26-612", "SHOPKNOT IMPEX INDIA PRIVATE LIMITED", "", MAIL, "", "", ""],
  ["16/09/2026", "Dhyana", "Sep26-613", "INBREW BEVERAGES PRIVATE LIMITED", "", MAIL, "", "", ""],
  ["16/09/2026", "Dhyana", "Sep26-614", COMPASS, "", MAIL, "", "", ""],
  ["16/09/2026", "Dhyana", "Sep26-615", "Creative Plastic Industries", "", MAIL, "", "", ""],
  ["17/09/2026", "Prabhnoor", "Sep26-618", "SELECT BRANDS INTERNATIONAL PRIVATE LIMITED", "", MAIL, "Asap", "", "Delivered"],
  ["18/09/2026", "Dhyana", "Sep26-657", COMPASS, "", MAIL, "", "", ""],
  ["18/09/2026", "Dhyana", "Sep26-658", "Avyan Tech Serve Pvt Ltd", "", MAIL, "", "", ""],
  ["19/09/2026", "Dhyana", "Sep26-723", "Savitri Woods", "", MAIL, "", "", ""],
  ["21/09/2026", "Prabhnoor", "Sep26-770", "East India House", "", MAIL, "Asap", "", "Delivered"],
  ["23/09/2026", "Prabhnoor", "Sep26-821", "RUDRA BUSINESS SERVICES PRIVATE LIMITED", "", MAIL, "20/10/26", "", ""],
  ["23/09/2026", "Prabhnoor", "Sep26-833", "NEW LIFE HOTELS & RESORTS", "", MAIL, "4/10/26", "", ""],
  ["23/09/2026", "Kritik", "Sep26-834", "Bad Brains Street Style pvt ltd", "", MAIL, "", "", ""],
  ["24/09/2026", "Prabhnoor", "Sep26-846", "Archit Gupta", "", MAIL, NO_CLUE, "", "Delivered"],
  ["24/09/2026", "Amal", "Sep26-892", "Vendiman Pvt. Ltd.", "", MAIL, "", "", ""],
  ["25/09/2026", "Dhyana", "Sep26-910", COMPASS, "", MAIL, "", "", ""],
  ["25/09/2026", "Dhyana", "Sep26-911", COMPASS, "", MAIL, "", "", ""],
  ["25/09/2026", "Dhyana", "Sep26-912", COMPASS, "", MAIL, "", "", ""],
  ["28/09/2026", "Amal", "Sept26-970", INNO, "", MAIL, "", "", ""],
  ["28/09/2026", "Dhyana", "Sept26-988", "PIPELINE INFRASTRUCTURE LIMITED", "", MAIL, "", "", ""],
  ["28/09/2026", "Prabhnoor", "Sept26-1002", HOULIHAN, "", MAIL, "", "", "Delivered"],
  ["28/09/2026", "Prabhnoor", "Sept26-1003", HOULIHAN, "", MAIL, "", "", "Delivered"],
  ["28/09/2026", "Prabhnoor", "Sept26-1005", "Bhakti", "", MAIL, "", "", ""],
  ["28/09/2026", "Amal", "Sept26-1011", "Mistins", "", MAIL, "", "", ""],
  ["28/09/2026", "Prabhnoor", "Sep26-1029", "HIJYNX COWORKING PRIVATE LIMITED", "", MAIL, "", "", ""],
  ["28/09/2026", "Prabhnoor", "Sep26-1030", "Sagar Rubber products pvt ltd", "", MAIL, "", "", ""],
  ["29/09/2026", "Prabhnoor", "Sep26-1042", "Deutsche Bank", "", MAIL, "", "", ""],
  ["29/09/2026", "Dhyana", "Sep26-1057", COMPASS, "", MAIL, "", "", ""],
  ["29/09/2026", "Dhyana", "Sep26-1058", COMPASS, "", MAIL, "", "", ""],
  ["29/09/2026", "Prabhnoor", "Sep26-1080", "EQT Partners India Private Limited", "", MAIL, "", "", ""],
  ["29/09/2026", "Shivani", "Sep26-1081", INNO, "", MAIL, "", "", ""],
  ["29/09/2026", "Dhyana", "Sep26-1082", "Kapco Banquets & Catering Pvt. Ltd.", "", MAIL, "", "", ""],
  ["29/09/2026", "Prabhnoor", "Sep26-1083", "ALTERKITCH INDIA PRIVATE LIMITED", "", MAIL, "", "", ""],
  ["30/09/2026", "Prabhnoor", "Sep26-1094", "MAGNANIMOUS VENTURES PRIVATE LIMITED", "", MAIL, "", "", ""],
  ["30/09/2026", "Dhyana", "Oct26-002", "Matrix Pharmacorp Private Limited", "", MAIL, "", "", ""],
  ["01/10/2026", "Kritik", "Oct26-057", "BEAMS VC PARTNERZ LLP", "", MAIL, "", "", ""],
  ["01/10/2026", "Dhyana", "Oct26-058", "Quizizz India Private Limited", "", MAIL, "", "", ""],
  ["03/10/2026", "Shivani", "Oct26-094", AMPL, "", MAIL, "", "", ""],
  ["03/10/2026", "Kritik", "Oct26-096", "Anil and company", "", MAIL, "", "", ""],
  ["03/10/2026", "Shivani", "Oct26-109", "Pinnacle Grand Hotels & Banquets", "", MAIL, "", "", ""],
  ["03/10/2026", "Kritik", "Oct26-130", "DEV MARKETING", "", MAIL, "", "", ""],
  ["05/10/2026", "Dhyana", "Oct26-143", JUST, "", MAIL, "", "", ""],
  ["05/10/2026", "Dhyana", "Oct26-149", JUST, "", MAIL, "", "", ""],
  ["05/10/2026", "Shivani", "Oct26-187", "DESIGN CULT", "", MAIL, "", "", ""],
  ["05/10/2026", "Dhyana", "Oct26-192", "LALLOOJI & SONS", "", MAIL, "", "", ""],
  ["05/10/2026", "Prabhnoor", "Oct26-194", "BOW AND BOX", "", MAIL, "", "", ""],
  ["05/10/2026", "Prabhnoor", "Oct26-195", VEGA, "", MAIL, "", "", ""],
  ["05/10/2026", "Dhyana", "Oct26-196", VIKAS, "", MAIL, "", "", ""],
  ["05/10/2026", "Dhyana", "Oct26-197", "Unique Hospitality Sales", "", MAIL, "", "", ""],
  ["06/10/2026", "Dhyana", "Oct26-212", NAMRUP, "", MAIL, "", "", ""],
  ["06/10/2026", "Shivani", "Oct26-257", AMPL, "", MAIL, "", "", ""],
  ["06/10/2026", "Prabhnoor", "Oct26-259", "Radix Web Services Pvt Ltd", "", MAIL, "", "", ""],
  ["07/10/2026", "Shivani", "Oct26-308", "Dristi Bajoria", "", MAIL, "", "", ""],
  ["07/10/2026", "Kritik", "Oct26-310", "Srishti Bhattacharya", "", MAIL, "", "", ""],
  ["08/10/2026", "Dhyana", "Oct26-313", VIKAS, "", MAIL, "", "", ""],
  ["08/10/2026", "Kritik", "Oct26-347", "WINSOME MEDICARE PVT LTD", "", MAIL, "", "", ""],
  ["08/10/2026", "Dhyana", "Oct26-354", NAMRUP, "", MAIL, "", "", ""],
  ["08/10/2026", "Kritik", "Oct26-355", "SJJ REALTY PRIVATE LIMITED", "", MAIL, "", "", ""],
  ["08/10/2026", "Dhyana", "Oct26-356", COMPASS, "", MAIL, "", "", ""],
  ["09/10/2026", "Kritik", "Oct26-357", "D'NIRO GIFTING STUDIO", "", MAIL, "", "", ""],
  ["09/10/2026", "Shivani", "Oct26-409", "Narayan Bhargava Group", "", MAIL, "", "", ""],
  ["09/10/2026", "Shivani", "Oct26-412", "Shriji Enterprises", "", MAIL, "", "", ""],
  ["09/10/2026", "Prabhnoor", "Oct26-413", "Vikas Dry Fruits", "", MAIL, "", "", ""],
  ["09/10/2026", "Prabhnoor", "Oct26-414", "Srilalitha Gopal", "", MAIL, "", "", ""],
  ["10/10/2026", "Dhyana", "Oct26-429", "BAHWAN CYBERTEK PVT LTD", "", MAIL, "", "", ""],
  ["10/10/2026", "Dhyana", "Oct26-430", VIKAS, "", MAIL, "", "", ""],
  ["10/10/2026", "Prabhnoor", "Oct26-465", VEGA, "", MAIL, "", "", ""],
  ["12/10/2026", "Amal", "Oct26-497", "Innomotive Solutions", "", MAIL, "", "", ""],
  ["12/10/2026", "Prabhnoor", "Oct26-517", "Manohar Foods", "", MAIL, "", "", ""],
  ["12/10/2026", "Kritik", "Oct26-518", "HRRK GROUP OF COMPANIES", "", MAIL, "", "", ""],
  ["13/10/2026", "Dhyana", "Oct26-532", "BCT Consulting Private Limited", "", MAIL, "", "", ""],
  ["13/10/2026", "Prabhnoor", "Oct26-536", "Archana Nithul", "", MAIL, "", "", ""],
  ["13/10/2026", "Prabhnoor", "Oct26-537", "Neeraj P Maithel", "", MAIL, "", "", ""],
  ["13/10/2026", "Shivani", "Oct26-538", "Sarvodaya Hospital", "", MAIL, "", "", ""],
  ["14/10/2026", "Kritik", "Oct26-559", "NIIF Infrastructure Finance Limited", "105 Red amgnetic Hampers", MAIL, "", "", ""],
  ["14/10/2026", "Amal", "Oct26-571", "TLC", "100 Best seller 17 Hamper with customised card", "Dahi Papdi Chaat Quinoa Puffs, Peri Peri Ragi Chips, Chocolatey Dip with Biscuit Sticks, Bombay Masala Veggie Chips, Sweet Chilli Zucchini Chips, Lime & Sriracha Chickpea Puffs", "17th October", "", ""],
];

const KEYS = ["date", "poc", "ref", "client", "kind", "products", "expected", "opsDate", "status"];

export const demoOrders = rows.map((r) => Object.fromEntries(KEYS.map((k, i) => [k, r[i]])));

// A few illustrative dates so the demo shows every status. Real sheets are never touched by this.
const byRef = Object.fromEntries(demoOrders.map((o) => [o.ref, o]));
byRef["Oct26-536"].expected = "18/10/2026";
byRef["Oct26-413"].expected = "16/10/2026";
byRef["Oct26-465"].expected = "Asap";
byRef["Oct26-354"].expected = "12/10/2026";
byRef["Oct26-409"].expected = "21/10/2026";
byRef["Oct26-559"].expected = "10/10/2026";
byRef["Oct26-354"].status = "In transit"; // 4 days past its date, still on its way
byRef["Oct26-536"].status = "In transit";
byRef["Oct26-571"].expected = "17th October";

export const demoMeta = { "Oct26-559": { urgent: true, opsNote: "" } };

export const demoLeads = [
  { leadRef: "Lead-Oct26-001", date: "12/10/2026", poc: "Prabhnoor", client: "Orbit Fintech Pvt Ltd", kind: "50 Festive hampers", products: "Assorted festive hamper", expected: "30/10/2026", stage: "Quoted", followUp: "18/10/2026", converted: "" },
  { leadRef: "Lead-Oct26-002", date: "13/10/2026", poc: "Dhyana", client: "Greenleaf Hospitality", kind: "Loose products", products: "Chips and puffs assortment", expected: "", stage: "New", followUp: "17/10/2026", converted: "" },
  { leadRef: "Lead-Oct26-003", date: "14/10/2026", poc: "Kritik", client: "Meridian Advisory LLP", kind: "120 Diwali hampers", products: "Premium magnetic hamper", expected: "05/11/2026", stage: "Negotiating", followUp: "16/10/2026", converted: "" },
];
