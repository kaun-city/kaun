# Constituencies — India (Lok Sabha, 543)

_Auto-generated on 2026-08-30 by [`scripts/generate-wiki/india-index.mjs`](https://github.com/kaun-city/kaun/blob/master/scripts/generate-wiki/india-index.mjs), reading the kaun.city Supabase tables with the public anon key. Refreshed weekly by the `refresh-india-wiki` workflow; if something looks wrong the source of truth is the database, so please [open an issue](https://github.com/kaun-city/kaun/issues/new) with the seat code and the correction._

Every Lok Sabha seat gets a page here: who holds it, which assembly segments and districts
it is made of, what its MP has declared, and what Parliament records of their work. Each seat
also links to its live page on kaun.city, which adds the map, the choropleth layers and the
comparison tools this wiki does not try to reproduce.

**[Open the interactive India map on kaun.city →](https://kaun.city/india)** — all 543 seats on one map,
shaded by declared criminal cases, MPLADS utilization or attendance, with search by seat or MP name.

!!! info "How seats are keyed"
    Kaun's seat key is `pc_code` = `<state code>-<seat number>`, unpadded — Bangalore Central is
    `29-25`. The seat number alone is **not** nationally unique: it restarts at 1 in every state
    and UT, so `pc_no = 1` names 36 different seats. Anything keyed on the seat number alone
    silently merges them. The state code is the Census-2011 code as extended by DataMeet
    (Telangana 36, residuary Andhra Pradesh 37, Ladakh 38).

---

## What is loaded right now

The India layer is fed by six independent pipelines on different cadences. This table is the
state of each one at the moment these pages were generated — a blank section on a seat page
means the pipeline has not landed yet, not that the seat has no data.

| Dataset | Table | Rows readable | Status |
|---|---|---:|---|
| Seats, boundaries and reservation | `in_constituencies` | 543 | complete — all 543 seats |
| Sitting MPs (18th Lok Sabha) | `in_mps` | 540 | 540 seats matched to a sitting MP · 3 vacant |
| Nomination affidavits (publicly cleared) | `in_mp_affidavits` | 543 | 543 seats |
| Parliamentary activity | `in_mp_activity` | 4,877 | 544 MPs |
| MPLADS allocation and spend | `in_mplads_summary` | 553 | 516 seats |
| Central projects ≥ ₹150 Cr | `in_central_projects` | 2,033 | latest report held: May 2026 |

"Rows readable" is what the **public** anon role can see. `in_mp_affidavits` is row-restricted:
an affidavit becomes readable only after its MyNeta↔seat join has been reviewed, so a low number
there means review is pending, not that the scrape failed.

---

## Seats by state

543 seats across 36 states and union territories. 540 have a sitting MP in the roster; 3 do not.

A seat shows no MP for one of two reasons, and they are different reasons:

- **Vacant** — the seat's MP has died, resigned or been disqualified and the bypoll has not
  happened. Kaun keeps the predecessor's row and names them on the seat page, but never presents
  them as the current MP.
- **Not matched** — the roster holds an MP whose constituency name has not yet been resolved to a
  seat code. Names resolve through a reviewed alias table and exact
  normalized matching only — never by similarity — so an unresolved name stays visibly
  unresolved instead of being guessed onto a seat.

Jump to: [Andaman & Nicobar](#andaman-nicobar) · [Andhra Pradesh](#andhra-pradesh) · [Arunachal Pradesh](#arunachal-pradesh) · [Assam](#assam) · [Bihar](#bihar) · [Chandigarh](#chandigarh) · [Chhattisgarh](#chhattisgarh) · [Dadra and Nagar Haveli and Daman and Diu](#dadra-and-nagar-haveli-and-daman-and-diu) · [Delhi](#delhi) · [Goa](#goa) · [Gujarat](#gujarat) · [Haryana](#haryana) · [Himachal Pradesh](#himachal-pradesh) · [Jammu & Kashmir](#jammu-kashmir) · [Jharkhand](#jharkhand) · [Karnataka](#karnataka) · [Kerala](#kerala) · [Ladakh](#ladakh) · [Lakshadweep](#lakshadweep) · [Madhya Pradesh](#madhya-pradesh) · [Maharashtra](#maharashtra) · [Manipur](#manipur) · [Meghalaya](#meghalaya) · [Mizoram](#mizoram) · [Nagaland](#nagaland) · [Odisha](#odisha) · [Puducherry](#puducherry) · [Punjab](#punjab) · [Rajasthan](#rajasthan) · [Sikkim](#sikkim) · [Tamil Nadu](#tamil-nadu) · [Telangana](#telangana) · [Tripura](#tripura) · [Uttar Pradesh](#uttar-pradesh) · [Uttarakhand](#uttarakhand) · [West Bengal](#west-bengal)

### Andaman & Nicobar

1 seat.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `35-1` | [Andaman & Nicobar](35-1-andaman-nicobar.md) | — | Bishnu Pada Ray | BJP | none declared | [open →](https://kaun.city/india/c/35-1) |

### Andhra Pradesh

25 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `37-1` | [Araku](37-1-araku.md) | ST | Gumma Thanuja Rani | YSR Congress Party | none declared | [open →](https://kaun.city/india/c/37-1) |
| `37-2` | [Srikakulam](37-2-srikakulam.md) | — | Kinjarapu Rammohan Naidu ·&nbsp;minister | TDP | ⚠ 4 | [open →](https://kaun.city/india/c/37-2) |
| `37-3` | [Vizianagaram](37-3-vizianagaram.md) | — | Appalanaidu Kalisetti | TDP | none declared | [open →](https://kaun.city/india/c/37-3) |
| `37-4` | [Visakhapatnam](37-4-visakhapatnam.md) | — | Sribharat Mathukumilli | TDP | ⚠ 2 | [open →](https://kaun.city/india/c/37-4) |
| `37-5` | [Anakapalle](37-5-anakapalle.md) | — | C M Ramesh | BJP | ⚠ 5 | [open →](https://kaun.city/india/c/37-5) |
| `37-6` | [Kakinada](37-6-kakinada.md) | — | Tangella Uday Srinivas | JSP | ⚠ 1 | [open →](https://kaun.city/india/c/37-6) |
| `37-7` | [Amalapuram](37-7-amalapuram.md) | SC | G M Harish Balayogi | TDP | none declared | [open →](https://kaun.city/india/c/37-7) |
| `37-8` | [Rajahmundry](37-8-rajahmundry.md) | — | D. Purandeswari | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/37-8) |
| `37-9` | [Narsapuram](37-9-narsapuram.md) | — | Srinivasa Varma B J P Varma Bhupathiraju ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/37-9) |
| `37-10` | [Eluru](37-10-eluru.md) | — | Putta Mahesh Kumar | TDP | ⚠ 1 | [open →](https://kaun.city/india/c/37-10) |
| `37-11` | [Machilipatnam](37-11-machilipatnam.md) | — | Balashowry Vallabhaneni | JSP | ⚠ 2 | [open →](https://kaun.city/india/c/37-11) |
| `37-12` | [Vijayawada](37-12-vijayawada.md) | — | Kesineni Sivanath | TDP | none declared | [open →](https://kaun.city/india/c/37-12) |
| `37-13` | [Guntur](37-13-guntur.md) | — | Chandra Sekhar Pemmasani ·&nbsp;minister | TDP | ⚠ 1 | [open →](https://kaun.city/india/c/37-13) |
| `37-14` | [Narasaraopet](37-14-narasaraopet.md) | — | Lavu Sri Krishna Devarayalu | TDP | none declared | [open →](https://kaun.city/india/c/37-14) |
| `37-15` | [Bapatla](37-15-bapatla.md) | SC | Krishna Prasad Tenneti | TDP | none declared | [open →](https://kaun.city/india/c/37-15) |
| `37-16` | [Ongole](37-16-ongole.md) | — | Magunta Sreenivasulu Reddy | TDP | none declared | [open →](https://kaun.city/india/c/37-16) |
| `37-17` | [Nandyal](37-17-nandyal.md) | — | Byreddy Shabari | TDP | ⚠ 2 | [open →](https://kaun.city/india/c/37-17) |
| `37-18` | [Kurnool](37-18-kurnool.md) | — | Bastipati Nagaraju | TDP | none declared | [open →](https://kaun.city/india/c/37-18) |
| `37-19` | [Anantapur](37-19-anantapur.md) | — | G Lakshminarayana | TDP | ⚠ 8 | [open →](https://kaun.city/india/c/37-19) |
| `37-20` | [Hindupur](37-20-hindupur.md) | — | B K Parthasarathi | TDP | ⚠ 15 | [open →](https://kaun.city/india/c/37-20) |
| `37-21` | [Kadapa](37-21-kadapa.md) | — | Y S Avinash Reddy | YSR Congress Party | ⚠ 2 | [open →](https://kaun.city/india/c/37-21) |
| `37-22` | [Nellore](37-22-nellore.md) | — | Prabhakar Reddy Vemireddy | TDP | ⚠ 6 | [open →](https://kaun.city/india/c/37-22) |
| `37-23` | [Tirupati](37-23-tirupati.md) | SC | Maddila Gurumoorthy | YSR Congress Party | none declared | [open →](https://kaun.city/india/c/37-23) |
| `37-24` | [Rajampet](37-24-rajampet.md) | — | P V Midhun Reddy | YSR Congress Party | none declared | [open →](https://kaun.city/india/c/37-24) |
| `37-25` | [Chittoor](37-25-chittoor.md) | SC | Daggumalla Prasada Rao | TDP | none declared | [open →](https://kaun.city/india/c/37-25) |

### Arunachal Pradesh

2 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `12-1` | [Arunachal West](12-1-arunachal-west.md) | — | Kiren Rijiju ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/12-1) |
| `12-2` | [Arunachal East](12-2-arunachal-east.md) | — | Tapir Gao | BJP | none declared | [open →](https://kaun.city/india/c/12-2) |

### Assam

14 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `18-1` | [Kokrajhar](18-1-kokrajhar.md) | ST | Joyanta Basumatary | UPPL | ⚠ 1 | [open →](https://kaun.city/india/c/18-1) |
| `18-2` | [Dhubri](18-2-dhubri.md) | — | Rakibul Hussain | INC | none declared | [open →](https://kaun.city/india/c/18-2) |
| `18-3` | [Barpeta](18-3-barpeta.md) | — | Phani Bhusan Choudhury | AGP | ⚠ 1 | [open →](https://kaun.city/india/c/18-3) |
| `18-4` | [Darrang-Udalguri](18-4-darrang-udalguri.md) | — | Dilip Saikia | BJP | none declared | [open →](https://kaun.city/india/c/18-4) |
| `18-5` | [Guwahati](18-5-guwahati.md) | — | Bijuli Kalita Medhi | BJP | none declared | [open →](https://kaun.city/india/c/18-5) |
| `18-6` | [Diphu](18-6-diphu.md) | ST | Amarsing Tisso | BJP | none declared | [open →](https://kaun.city/india/c/18-6) |
| `18-7` | [Karimganj](18-7-karimganj.md) | — | Kripanath Mallah | BJP | none declared | [open →](https://kaun.city/india/c/18-7) |
| `18-8` | [Silchar](18-8-silchar.md) | SC | Parimal Suklabaidya | BJP | none declared | [open →](https://kaun.city/india/c/18-8) |
| `18-9` | [Nagaon](18-9-nagaon.md) | — | _vacant — bypoll pending_ | — | none declared | [open →](https://kaun.city/india/c/18-9) |
| `18-10` | [Kaziranga](18-10-kaziranga.md) | — | Kamakhya Prasad Tasa | BJP | none declared | [open →](https://kaun.city/india/c/18-10) |
| `18-11` | [Sonitpur](18-11-sonitpur.md) | — | Ranjit Dutta | BJP | none declared | [open →](https://kaun.city/india/c/18-11) |
| `18-12` | [Lakhimpur](18-12-lakhimpur.md) | — | Pradan Baruah | BJP | none declared | [open →](https://kaun.city/india/c/18-12) |
| `18-13` | [Dibrugarh](18-13-dibrugarh.md) | — | Sarbananda Sonowal ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/18-13) |
| `18-14` | [Jorhat](18-14-jorhat.md) | — | Gaurav Gogoi | INC | ⚠ 1 | [open →](https://kaun.city/india/c/18-14) |

### Bihar

40 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `10-1` | [Valmiki Nagar](10-1-valmiki-nagar.md) | — | Sunil Kumar | JD(U) | none declared | [open →](https://kaun.city/india/c/10-1) |
| `10-2` | [Paschim Champaran](10-2-paschim-champaran.md) | — | Sanjay Jaiswal | BJP | ⚠ 5 | [open →](https://kaun.city/india/c/10-2) |
| `10-3` | [Purvi Champaran](10-3-purvi-champaran.md) | — | Radha Mohan Singh | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/10-3) |
| `10-4` | [Sheohar](10-4-sheohar.md) | — | Lovely Anand | JD(U) | none declared | [open →](https://kaun.city/india/c/10-4) |
| `10-5` | [Sitamarhi](10-5-sitamarhi.md) | — | Devesh Chandra Thakur | JD(U) | ⚠ 1 | [open →](https://kaun.city/india/c/10-5) |
| `10-6` | [Madhubani](10-6-madhubani.md) | — | Ashok Kumar Yadav | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/10-6) |
| `10-7` | [Jhanjharpur](10-7-jhanjharpur.md) | — | Ramprit Mandal | JD(U) | none declared | [open →](https://kaun.city/india/c/10-7) |
| `10-8` | [Supaul](10-8-supaul.md) | — | Dileshwar Kamait | JD(U) | ⚠ 1 | [open →](https://kaun.city/india/c/10-8) |
| `10-9` | [Araria](10-9-araria.md) | — | Pradeep Kumar Singh | BJP | ⚠ 4 | [open →](https://kaun.city/india/c/10-9) |
| `10-10` | [Kishanganj](10-10-kishanganj.md) | — | Mohammad Jawed | INC | none declared | [open →](https://kaun.city/india/c/10-10) |
| `10-11` | [Katihar](10-11-katihar.md) | — | Tariq Anwar | INC | none declared | [open →](https://kaun.city/india/c/10-11) |
| `10-12` | [Purnia](10-12-purnia.md) | — | Rajesh Ranjan | Ind. | ⚠ 41 | [open →](https://kaun.city/india/c/10-12) |
| `10-13` | [Madhepura](10-13-madhepura.md) | — | Dinesh Chandra Yadav | JD(U) | none declared | [open →](https://kaun.city/india/c/10-13) |
| `10-14` | [Darbhanga](10-14-darbhanga.md) | — | Gopal Jee Thakur | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/10-14) |
| `10-15` | [Muzaffarpur](10-15-muzaffarpur.md) | — | Raj Bhushan Choudhary ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/10-15) |
| `10-16` | [Vaishali](10-16-vaishali.md) | — | Veena Devi | LJSP(RV) | ⚠ 3 | [open →](https://kaun.city/india/c/10-16) |
| `10-17` | [Gopalganj](10-17-gopalganj.md) | SC | Alok Kumar Suman | JD(U) | none declared | [open →](https://kaun.city/india/c/10-17) |
| `10-18` | [Siwan](10-18-siwan.md) | — | Vijaylakshmi Devi | JD(U) | none declared | [open →](https://kaun.city/india/c/10-18) |
| `10-19` | [Maharajganj](10-19-maharajganj.md) | — | Janardan Singh Sigriwal | BJP | ⚠ 5 | [open →](https://kaun.city/india/c/10-19) |
| `10-20` | [Saran](10-20-saran.md) | — | Rajiv Pratap Rudy | BJP | none declared | [open →](https://kaun.city/india/c/10-20) |
| `10-21` | [Hajipur](10-21-hajipur.md) | SC | Chirag Paswan ·&nbsp;minister | LJSP(RV) | none declared | [open →](https://kaun.city/india/c/10-21) |
| `10-22` | [Ujiarpur](10-22-ujiarpur.md) | — | Nityanand Rai ·&nbsp;minister | BJP | ⚠ 3 | [open →](https://kaun.city/india/c/10-22) |
| `10-23` | [Samastipur](10-23-samastipur.md) | SC | Shambhavi | LJSP(RV) | none declared | [open →](https://kaun.city/india/c/10-23) |
| `10-24` | [Begusarai](10-24-begusarai.md) | — | Giriraj Singh ·&nbsp;minister | BJP | ⚠ 3 | [open →](https://kaun.city/india/c/10-24) |
| `10-25` | [Khagaria](10-25-khagaria.md) | — | Rajesh Verma | LJSP(RV) | ⚠ 12 | [open →](https://kaun.city/india/c/10-25) |
| `10-26` | [Bhagalpur](10-26-bhagalpur.md) | — | Ajay Kumar Mandal | JD(U) | none declared | [open →](https://kaun.city/india/c/10-26) |
| `10-27` | [Banka](10-27-banka.md) | — | Giridhari Yadav | JD(U) | none declared | [open →](https://kaun.city/india/c/10-27) |
| `10-28` | [Munger](10-28-munger.md) | — | Rajiv Ranjan Singh ·&nbsp;minister | JD(U) | none declared | [open →](https://kaun.city/india/c/10-28) |
| `10-29` | [Nalanda](10-29-nalanda.md) | — | Kaushalendra Kumar | JD(U) | none declared | [open →](https://kaun.city/india/c/10-29) |
| `10-30` | [Patna Sahib](10-30-patna-sahib.md) | — | Ravi Shankar Prasad | BJP | none declared | [open →](https://kaun.city/india/c/10-30) |
| `10-31` | [Pataliputra](10-31-pataliputra.md) | — | Misha Bharti | RJD | ⚠ 6 | [open →](https://kaun.city/india/c/10-31) |
| `10-32` | [Arrah](10-32-arrah.md) | — | Sudama Prasad | CPI(ML)(L) | ⚠ 3 | [open →](https://kaun.city/india/c/10-32) |
| `10-33` | [Buxar](10-33-buxar.md) | — | Sudhakar Singh | RJD | ⚠ 3 | [open →](https://kaun.city/india/c/10-33) |
| `10-34` | [Sasaram](10-34-sasaram.md) | SC | Manoj Kumar | INC | ⚠ 1 | [open →](https://kaun.city/india/c/10-34) |
| `10-35` | [Karakat](10-35-karakat.md) | — | Raja Ram Singh | CPI(ML)(L) | ⚠ 3 | [open →](https://kaun.city/india/c/10-35) |
| `10-36` | [Jahanabad](10-36-jahanabad.md) | — | Surendra Prasad Yadav | RJD | ⚠ 7 | [open →](https://kaun.city/india/c/10-36) |
| `10-37` | [Aurangabad](10-37-aurangabad.md) | — | Abhay Kumar Sinha | RJD | ⚠ 16 | [open →](https://kaun.city/india/c/10-37) |
| `10-38` | [Gaya](10-38-gaya.md) | SC | Jitan Ram Manjhi ·&nbsp;minister | HAM (S) | ⚠ 6 | [open →](https://kaun.city/india/c/10-38) |
| `10-39` | [Nawada](10-39-nawada.md) | — | Vivek Thakur | BJP | none declared | [open →](https://kaun.city/india/c/10-39) |
| `10-40` | [Jamui](10-40-jamui.md) | SC | Arun Bharti | LJSP(RV) | none declared | [open →](https://kaun.city/india/c/10-40) |

### Chandigarh

1 seat.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `4-1` | [Chandigarh](4-1-chandigarh.md) | — | Manish Tewari | INC | none declared | [open →](https://kaun.city/india/c/4-1) |

### Chhattisgarh

11 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `22-1` | [Surguja](22-1-surguja.md) | ST | Chintamani Maharaj | BJP | none declared | [open →](https://kaun.city/india/c/22-1) |
| `22-2` | [Raigarh](22-2-raigarh.md) | ST | Radheshyam Rathiya | BJP | none declared | [open →](https://kaun.city/india/c/22-2) |
| `22-3` | [Janjgir-Champa](22-3-janjgir-champa.md) | SC | Kamlesh Jangde | BJP | none declared | [open →](https://kaun.city/india/c/22-3) |
| `22-4` | [Korba](22-4-korba.md) | — | Jyotsna Charandas Mahant | INC | none declared | [open →](https://kaun.city/india/c/22-4) |
| `22-5` | [Bilaspur](22-5-bilaspur.md) | — | Tokhan Sahu ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/22-5) |
| `22-6` | [Rajnandgaon](22-6-rajnandgaon.md) | — | Santosh Pandey | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/22-6) |
| `22-7` | [Durg](22-7-durg.md) | — | Vijay Baghel | BJP | none declared | [open →](https://kaun.city/india/c/22-7) |
| `22-8` | [Raipur](22-8-raipur.md) | — | Brijmohan Agrawal | BJP | none declared | [open →](https://kaun.city/india/c/22-8) |
| `22-9` | [Mahasamund](22-9-mahasamund.md) | — | Roopkumari Choudhary | BJP | none declared | [open →](https://kaun.city/india/c/22-9) |
| `22-10` | [Bastar](22-10-bastar.md) | ST | Mahesh Kashyap | BJP | none declared | [open →](https://kaun.city/india/c/22-10) |
| `22-11` | [Kanker](22-11-kanker.md) | ST | Bhojraj Nag | BJP | none declared | [open →](https://kaun.city/india/c/22-11) |

### Dadra and Nagar Haveli and Daman and Diu

2 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `25-1` | [Daman & Diu](25-1-daman-diu.md) | — | Patel Umeshbhai Babubhai | Ind. | ⚠ 14 | [open →](https://kaun.city/india/c/25-1) |
| `26-2` | [Dadra & Nagar Haveli](26-2-dadra-nagar-haveli.md) | ST | Delkar Kalaben Mohanbhai | BJP | none declared | [open →](https://kaun.city/india/c/26-2) |

### Delhi

7 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `7-1` | [Chandni Chowk](7-1-chandni-chowk.md) | — | Praveen Khandelwal | BJP | none declared | [open →](https://kaun.city/india/c/7-1) |
| `7-2` | [North East Delhi](7-2-north-east-delhi.md) | — | Manoj Tiwari | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/7-2) |
| `7-3` | [East Delhi](7-3-east-delhi.md) | — | Harsh Malhotra ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/7-3) |
| `7-4` | [New Delhi](7-4-new-delhi.md) | — | Bansuri Swaraj | BJP | none declared | [open →](https://kaun.city/india/c/7-4) |
| `7-5` | [North West Delhi](7-5-north-west-delhi.md) | SC | Yogender Chandolia | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/7-5) |
| `7-6` | [West Delhi](7-6-west-delhi.md) | — | Kamaljeet Sehrawat | BJP | none declared | [open →](https://kaun.city/india/c/7-6) |
| `7-7` | [South Delhi](7-7-south-delhi.md) | — | Ramvir Singh Bidhuri | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/7-7) |

### Goa

2 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `30-1` | [North Goa](30-1-north-goa.md) | — | Shripad Yesso Naik ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/30-1) |
| `30-2` | [South Goa](30-2-south-goa.md) | — | Captain Viriato Fernandes | INC | ⚠ 1 | [open →](https://kaun.city/india/c/30-2) |

### Gujarat

26 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `24-1` | [Kachchh](24-1-kachchh.md) | SC | Chavda Vinod Lakhamshi | BJP | none declared | [open →](https://kaun.city/india/c/24-1) |
| `24-2` | [Banaskantha](24-2-banaskantha.md) | — | Geniben Nagaji Thakor | INC | ⚠ 1 | [open →](https://kaun.city/india/c/24-2) |
| `24-3` | [Patan](24-3-patan.md) | — | Bharatsinhji Shankarji Dabhi | BJP | none declared | [open →](https://kaun.city/india/c/24-3) |
| `24-4` | [Mahesana](24-4-mahesana.md) | — | Haribhai Patel | BJP | none declared | [open →](https://kaun.city/india/c/24-4) |
| `24-5` | [Sabarkantha](24-5-sabarkantha.md) | — | Shobhanaben Mahendrasinh Baraiya | BJP | none declared | [open →](https://kaun.city/india/c/24-5) |
| `24-6` | [Gandhinagar](24-6-gandhinagar.md) | — | Amit Shah ·&nbsp;minister | BJP | ⚠ 3 | [open →](https://kaun.city/india/c/24-6) |
| `24-7` | [Ahmedabad East](24-7-ahmedabad-east.md) | — | Hasmukhbhai Somabhai Patel | BJP | none declared | [open →](https://kaun.city/india/c/24-7) |
| `24-8` | [Ahmedabad West](24-8-ahmedabad-west.md) | SC | Dineshbhai Makwana | BJP | none declared | [open →](https://kaun.city/india/c/24-8) |
| `24-9` | [Surendranagar](24-9-surendranagar.md) | — | Chandubhai Chhaganbhai Shihora | BJP | none declared | [open →](https://kaun.city/india/c/24-9) |
| `24-10` | [Rajkot](24-10-rajkot.md) | — | Parshottambhai Rupala | BJP | ⚠ 3 | [open →](https://kaun.city/india/c/24-10) |
| `24-11` | [Porbandar](24-11-porbandar.md) | — | Mansukh Mandaviya ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/24-11) |
| `24-12` | [Jamnagar](24-12-jamnagar.md) | — | Poonamben Hematbhai Maadam | BJP | none declared | [open →](https://kaun.city/india/c/24-12) |
| `24-13` | [Junagadh](24-13-junagadh.md) | — | Rajesh Naranbhai Chudasama | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/24-13) |
| `24-14` | [Amreli](24-14-amreli.md) | — | Bharatbhai Manubhai Sutariya | BJP | none declared | [open →](https://kaun.city/india/c/24-14) |
| `24-15` | [Bhavnagar](24-15-bhavnagar.md) | — | Nimuben Jayantibhai Bambhaniya ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/24-15) |
| `24-16` | [Anand](24-16-anand.md) | — | Miteshbhai Rameshbhai Patel | BJP | none declared | [open →](https://kaun.city/india/c/24-16) |
| `24-17` | [Kheda](24-17-kheda.md) | — | Devusinh Chauhan | BJP | none declared | [open →](https://kaun.city/india/c/24-17) |
| `24-18` | [Panchmahal](24-18-panchmahal.md) | — | Rajpalsinh Mahendrasinh Jadav | BJP | none declared | [open →](https://kaun.city/india/c/24-18) |
| `24-19` | [Dahod](24-19-dahod.md) | ST | Jaswantsinh Sumanbhai Bhabhor | BJP | none declared | [open →](https://kaun.city/india/c/24-19) |
| `24-20` | [Vadodara](24-20-vadodara.md) | — | Hemang Joshi | BJP | none declared | [open →](https://kaun.city/india/c/24-20) |
| `24-21` | [Chhota Udaipur](24-21-chhota-udaipur.md) | ST | Jashubhai Bhilubhai Rathva | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/24-21) |
| `24-22` | [Bharuch](24-22-bharuch.md) | — | Mansukhbhai Dhanjibhai Vasava | BJP | none declared | [open →](https://kaun.city/india/c/24-22) |
| `24-23` | [Bardoli](24-23-bardoli.md) | ST | Parbhubhai Nagarbhai Vasava | BJP | none declared | [open →](https://kaun.city/india/c/24-23) |
| `24-24` | [Surat](24-24-surat.md) | — | Mukeshkumar Chandrakaant Dalal | BJP | none declared | [open →](https://kaun.city/india/c/24-24) |
| `24-25` | [Navsari](24-25-navsari.md) | — | Chandrakant Raghunath Patil ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/24-25) |
| `24-26` | [Valsad](24-26-valsad.md) | ST | Dhaval Laxmanbhai Patel | BJP | none declared | [open →](https://kaun.city/india/c/24-26) |

### Haryana

10 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `6-1` | [Ambala](6-1-ambala.md) | SC | Varun Chaudhry | INC | none declared | [open →](https://kaun.city/india/c/6-1) |
| `6-2` | [Kurukshetra](6-2-kurukshetra.md) | — | Naveen Jindal | BJP | ⚠ 9 | [open →](https://kaun.city/india/c/6-2) |
| `6-3` | [Sirsa](6-3-sirsa.md) | SC | Kumari Selja | INC | none declared | [open →](https://kaun.city/india/c/6-3) |
| `6-4` | [Hisar](6-4-hisar.md) | — | Jai Parkash | INC | none declared | [open →](https://kaun.city/india/c/6-4) |
| `6-5` | [Karnal](6-5-karnal.md) | — | Manohar Lal ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/6-5) |
| `6-6` | [Sonipat](6-6-sonipat.md) | — | Satpal Brahamchari | INC | none declared | [open →](https://kaun.city/india/c/6-6) |
| `6-7` | [Rohtak](6-7-rohtak.md) | — | Deepender Singh Hooda | INC | none declared | [open →](https://kaun.city/india/c/6-7) |
| `6-8` | [Bhiwani-Mahendragarh](6-8-bhiwani-mahendragarh.md) | — | Dharambir Singh | BJP | none declared | [open →](https://kaun.city/india/c/6-8) |
| `6-9` | [Gurgaon](6-9-gurgaon.md) | — | Rao Inderjit Singh ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/6-9) |
| `6-10` | [Faridabad](6-10-faridabad.md) | — | Krishan Pal Gurjar ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/6-10) |

### Himachal Pradesh

4 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `2-1` | [Kangra](2-1-kangra.md) | — | Rajeev Bharadwaj | BJP | none declared | [open →](https://kaun.city/india/c/2-1) |
| `2-2` | [Mandi](2-2-mandi.md) | — | Kangna Ranaut | BJP | ⚠ 8 | [open →](https://kaun.city/india/c/2-2) |
| `2-3` | [Hamirpur](2-3-hamirpur.md) | — | Anurag Singh Thakur | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/2-3) |
| `2-4` | [Shimla](2-4-shimla.md) | SC | Suresh Kumar Kashyap | BJP | none declared | [open →](https://kaun.city/india/c/2-4) |

### Jammu & Kashmir

5 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `1-1` | [Baramulla](1-1-baramulla.md) | — | Abdul Rashid Sheikh | Ind. | ⚠ 3 | [open →](https://kaun.city/india/c/1-1) |
| `1-2` | [Srinagar](1-2-srinagar.md) | — | Aga Syed Ruhullah Mehdi | J&KNC | none declared | [open →](https://kaun.city/india/c/1-2) |
| `1-3` | [Anantnag-Rajouri](1-3-anantnag-rajouri.md) | — | Mian Altaf Ahmad | J&KNC | none declared | [open →](https://kaun.city/india/c/1-3) |
| `1-4` | [Udhampur](1-4-udhampur.md) | — | Jitendra Singh ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/1-4) |
| `1-5` | [Jammu](1-5-jammu.md) | — | Jugal Kishore | BJP | none declared | [open →](https://kaun.city/india/c/1-5) |

### Jharkhand

14 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `20-1` | [Rajmahal](20-1-rajmahal.md) | ST | Vijay Kumar Hansdak | JMM | none declared | [open →](https://kaun.city/india/c/20-1) |
| `20-2` | [Dumka](20-2-dumka.md) | ST | Nalin Soren | JMM | ⚠ 2 | [open →](https://kaun.city/india/c/20-2) |
| `20-3` | [Godda](20-3-godda.md) | — | Nishikant Dubey | BJP | ⚠ 8 | [open →](https://kaun.city/india/c/20-3) |
| `20-4` | [Chatra](20-4-chatra.md) | — | Kali Charan Singh | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/20-4) |
| `20-5` | [Kodarma](20-5-kodarma.md) | — | Annpurna Devi ·&nbsp;minister | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/20-5) |
| `20-6` | [Giridih](20-6-giridih.md) | — | Chandra Prakash Choudhary | AJSU | ⚠ 2 | [open →](https://kaun.city/india/c/20-6) |
| `20-7` | [Dhanbad](20-7-dhanbad.md) | — | Dulu Mahato | BJP | ⚠ 22 | [open →](https://kaun.city/india/c/20-7) |
| `20-8` | [Ranchi](20-8-ranchi.md) | — | Sanjay Seth ·&nbsp;minister | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/20-8) |
| `20-9` | [Jamshedpur](20-9-jamshedpur.md) | — | Bidyut Baran Mahato | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/20-9) |
| `20-10` | [Singhbhum](20-10-singhbhum.md) | ST | Joba Majhi | JMM | none declared | [open →](https://kaun.city/india/c/20-10) |
| `20-11` | [Khunti](20-11-khunti.md) | ST | Kali Charan Munda | INC | none declared | [open →](https://kaun.city/india/c/20-11) |
| `20-12` | [Lohardaga](20-12-lohardaga.md) | ST | Sukhdeo Bhagat | INC | ⚠ 1 | [open →](https://kaun.city/india/c/20-12) |
| `20-13` | [Palamu](20-13-palamu.md) | SC | Vishnu Dayal Ram | BJP | none declared | [open →](https://kaun.city/india/c/20-13) |
| `20-14` | [Hazaribagh](20-14-hazaribagh.md) | — | Manish Jaiswal | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/20-14) |

### Karnataka

28 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `29-1` | [Chikkodi](29-1-chikkodi.md) | — | Priyanka Satish Jarkiholi | INC | none declared | [open →](https://kaun.city/india/c/29-1) |
| `29-2` | [Belgaum](29-2-belgaum.md) | — | Jagadish Shettar | BJP | none declared | [open →](https://kaun.city/india/c/29-2) |
| `29-3` | [Bagalkot](29-3-bagalkot.md) | — | Gaddigoudar Parvatagouda Chandanagouda | BJP | none declared | [open →](https://kaun.city/india/c/29-3) |
| `29-4` | [Bijapur](29-4-bijapur.md) | SC | Ramesh Chandappa Jigajinagi | BJP | none declared | [open →](https://kaun.city/india/c/29-4) |
| `29-5` | [Gulbarga](29-5-gulbarga.md) | SC | Radhakrishna | INC | ⚠ 1 | [open →](https://kaun.city/india/c/29-5) |
| `29-6` | [Raichur](29-6-raichur.md) | ST | G Kumar Naik | INC | none declared | [open →](https://kaun.city/india/c/29-6) |
| `29-7` | [Bidar](29-7-bidar.md) | — | Sagar Eshwar Khandre | INC | none declared | [open →](https://kaun.city/india/c/29-7) |
| `29-8` | [Koppal](29-8-koppal.md) | — | K Rajashekar Basavaraj Hitnal | INC | ⚠ 3 | [open →](https://kaun.city/india/c/29-8) |
| `29-9` | [Bellary](29-9-bellary.md) | ST | E Tukaram | INC | none declared | [open →](https://kaun.city/india/c/29-9) |
| `29-10` | [Haveri](29-10-haveri.md) | — | Basavaraj Bommai | BJP | none declared | [open →](https://kaun.city/india/c/29-10) |
| `29-11` | [Dharwad](29-11-dharwad.md) | — | Pralhad Joshi ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/29-11) |
| `29-12` | [Uttara Kannada](29-12-uttara-kannada.md) | — | Vishweshwar Hegde Kageri | BJP | none declared | [open →](https://kaun.city/india/c/29-12) |
| `29-13` | [Davanagere](29-13-davanagere.md) | — | Prabha Mallikarjun | INC | none declared | [open →](https://kaun.city/india/c/29-13) |
| `29-14` | [Shimoga](29-14-shimoga.md) | — | B Y Raghavendra | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/29-14) |
| `29-15` | [Udupi Chikmagalur](29-15-udupi-chikmagalur.md) | — | Kota Srinivasa Poojary | BJP | none declared | [open →](https://kaun.city/india/c/29-15) |
| `29-16` | [Hassan](29-16-hassan.md) | — | Shreyas M Patel | INC | ⚠ 1 | [open →](https://kaun.city/india/c/29-16) |
| `29-17` | [Dakshina Kannada](29-17-dakshina-kannada.md) | — | Captain Brijesh Chowta | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/29-17) |
| `29-18` | [Chitradurga](29-18-chitradurga.md) | SC | Govind Makthappa Karjol | BJP | none declared | [open →](https://kaun.city/india/c/29-18) |
| `29-19` | [Tumkur](29-19-tumkur.md) | — | V Somanna ·&nbsp;minister | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/29-19) |
| `29-20` | [Mandya](29-20-mandya.md) | — | H D Kumaraswamy ·&nbsp;minister | JD(S) | ⚠ 3 | [open →](https://kaun.city/india/c/29-20) |
| `29-21` | [Mysore](29-21-mysore.md) | — | Yaduveer Wadiyar | BJP | none declared | [open →](https://kaun.city/india/c/29-21) |
| `29-22` | [Chamarajanagar](29-22-chamarajanagar.md) | SC | Sunil Bose | INC | ⚠ 1 | [open →](https://kaun.city/india/c/29-22) |
| `29-23` | [Bangalore Rural](29-23-bangalore-rural.md) | — | C N Manjunath | BJP | none declared | [open →](https://kaun.city/india/c/29-23) |
| `29-24` | [Bangalore North](29-24-bangalore-north.md) | — | Shobha Karandlaje ·&nbsp;minister | BJP | ⚠ 5 | [open →](https://kaun.city/india/c/29-24) |
| `29-25` | [Bangalore Central](29-25-bangalore-central.md) | — | P C Mohan | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/29-25) |
| `29-26` | [Bangalore South](29-26-bangalore-south.md) | — | Tejasvi Surya | BJP | ⚠ 3 | [open →](https://kaun.city/india/c/29-26) |
| `29-27` | [Chikkballapur](29-27-chikkballapur.md) | — | K Sudhakar | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/29-27) |
| `29-28` | [Kolar](29-28-kolar.md) | SC | M Mallesh Babu | JD(S) | ⚠ 1 | [open →](https://kaun.city/india/c/29-28) |

### Kerala

20 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `32-1` | [Kasaragod](32-1-kasaragod.md) | — | Rajmohan Unnithan | INC | ⚠ 6 | [open →](https://kaun.city/india/c/32-1) |
| `32-2` | [Kannur](32-2-kannur.md) | — | K Sudhakaran | INC | ⚠ 14 | [open →](https://kaun.city/india/c/32-2) |
| `32-3` | [Vadakara](32-3-vadakara.md) | — | Shafi Parambil | INC | ⚠ 47 | [open →](https://kaun.city/india/c/32-3) |
| `32-4` | [Wayanad](32-4-wayanad.md) | — | Priyanka Gandhi Vadra | INC | ⚠ 18 | [open →](https://kaun.city/india/c/32-4) |
| `32-5` | [Kozhikode](32-5-kozhikode.md) | — | M K Raghavan | INC | ⚠ 4 | [open →](https://kaun.city/india/c/32-5) |
| `32-6` | [Malappuram](32-6-malappuram.md) | — | E T Mohammed Basheer | IUML | ⚠ 1 | [open →](https://kaun.city/india/c/32-6) |
| `32-7` | [Ponnani](32-7-ponnani.md) | — | M P Abdussamad Samadani | IUML | ⚠ 1 | [open →](https://kaun.city/india/c/32-7) |
| `32-8` | [Palakkad](32-8-palakkad.md) | — | V K Sreekandan | INC | ⚠ 5 | [open →](https://kaun.city/india/c/32-8) |
| `32-9` | [Alathur](32-9-alathur.md) | SC | K Radhakrishnan | CPI(M) | none declared | [open →](https://kaun.city/india/c/32-9) |
| `32-10` | [Thrissur](32-10-thrissur.md) | — | Suresh Gopi ·&nbsp;minister | BJP | ⚠ 4 | [open →](https://kaun.city/india/c/32-10) |
| `32-11` | [Chalakudy](32-11-chalakudy.md) | — | Benny Behanan | INC | ⚠ 5 | [open →](https://kaun.city/india/c/32-11) |
| `32-12` | [Ernakulam](32-12-ernakulam.md) | — | Hibi Eden | INC | ⚠ 10 | [open →](https://kaun.city/india/c/32-12) |
| `32-13` | [Idukki](32-13-idukki.md) | — | Dean Kuriakose | INC | ⚠ 88 | [open →](https://kaun.city/india/c/32-13) |
| `32-14` | [Kottayam](32-14-kottayam.md) | — | K. Francis George | KEC | ⚠ 5 | [open →](https://kaun.city/india/c/32-14) |
| `32-15` | [Alappuzha](32-15-alappuzha.md) | — | K C Venugopal | INC | ⚠ 1 | [open →](https://kaun.city/india/c/32-15) |
| `32-16` | [Mavelikkara](32-16-mavelikkara.md) | SC | Kodikunnil Suresh | INC | ⚠ 6 | [open →](https://kaun.city/india/c/32-16) |
| `32-17` | [Pathanamthitta](32-17-pathanamthitta.md) | — | Anto Antony | INC | ⚠ 5 | [open →](https://kaun.city/india/c/32-17) |
| `32-18` | [Kollam](32-18-kollam.md) | — | N K Premachandran | RSP | ⚠ 5 | [open →](https://kaun.city/india/c/32-18) |
| `32-19` | [Attingal](32-19-attingal.md) | — | Adoor Prakash | INC | ⚠ 13 | [open →](https://kaun.city/india/c/32-19) |
| `32-20` | [Thiruvananthapuram](32-20-thiruvananthapuram.md) | — | Shashi Tharoor | INC | ⚠ 12 | [open →](https://kaun.city/india/c/32-20) |

### Ladakh

1 seat.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `38-1` | [Ladakh](38-1-ladakh.md) | — | Mohmad Haneefa | Ind. | none declared | [open →](https://kaun.city/india/c/38-1) |

### Lakshadweep

1 seat.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `31-1` | [Lakshadweep](31-1-lakshadweep.md) | ST | Muhammed Hamdullah Sayeed | INC | none declared | [open →](https://kaun.city/india/c/31-1) |

### Madhya Pradesh

29 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `23-1` | [Morena](23-1-morena.md) | — | Shivmangal Singh Tomar | BJP | none declared | [open →](https://kaun.city/india/c/23-1) |
| `23-2` | [Bhind](23-2-bhind.md) | SC | Sandhya Ray | BJP | none declared | [open →](https://kaun.city/india/c/23-2) |
| `23-3` | [Gwalior](23-3-gwalior.md) | — | Bharat Singh Kushwah | BJP | none declared | [open →](https://kaun.city/india/c/23-3) |
| `23-4` | [Guna](23-4-guna.md) | — | Jyotiraditya M Scindia ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/23-4) |
| `23-5` | [Sagar](23-5-sagar.md) | — | Lata Wankhede | BJP | none declared | [open →](https://kaun.city/india/c/23-5) |
| `23-6` | [Tikamgarh](23-6-tikamgarh.md) | SC | Virendra Kumar ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/23-6) |
| `23-7` | [Damoh](23-7-damoh.md) | — | Rahul Singh Lodhi | BJP | none declared | [open →](https://kaun.city/india/c/23-7) |
| `23-8` | [Khajuraho](23-8-khajuraho.md) | — | Vishnu Datt Sharma | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/23-8) |
| `23-9` | [Satna](23-9-satna.md) | — | Ganesh Singh | BJP | ⚠ 3 | [open →](https://kaun.city/india/c/23-9) |
| `23-10` | [Rewa](23-10-rewa.md) | — | Janardan Mishra | BJP | none declared | [open →](https://kaun.city/india/c/23-10) |
| `23-11` | [Sidhi](23-11-sidhi.md) | — | Rajesh Mishra | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/23-11) |
| `23-12` | [Shahdol](23-12-shahdol.md) | ST | Himadri Singh | BJP | none declared | [open →](https://kaun.city/india/c/23-12) |
| `23-13` | [Jabalpur](23-13-jabalpur.md) | — | Ashish Dubey | BJP | none declared | [open →](https://kaun.city/india/c/23-13) |
| `23-14` | [Mandla](23-14-mandla.md) | ST | Faggan Singh Kulaste | BJP | none declared | [open →](https://kaun.city/india/c/23-14) |
| `23-15` | [Balaghat](23-15-balaghat.md) | — | Bharti Pardhi | BJP | none declared | [open →](https://kaun.city/india/c/23-15) |
| `23-16` | [Chhindwara](23-16-chhindwara.md) | — | Bunty Vivek Sahu | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/23-16) |
| `23-17` | [Hoshangabad](23-17-hoshangabad.md) | — | Darshan Singh Choudhary | BJP | none declared | [open →](https://kaun.city/india/c/23-17) |
| `23-18` | [Vidisha](23-18-vidisha.md) | — | Shivraj Singh Chouhan ·&nbsp;minister | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/23-18) |
| `23-19` | [Bhopal](23-19-bhopal.md) | — | Alok Sharma | BJP | ⚠ 4 | [open →](https://kaun.city/india/c/23-19) |
| `23-20` | [Rajgarh](23-20-rajgarh.md) | — | Rodmal Nagar | BJP | none declared | [open →](https://kaun.city/india/c/23-20) |
| `23-21` | [Dewas](23-21-dewas.md) | SC | Mahendra Singh Solanky | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/23-21) |
| `23-22` | [Ujjain](23-22-ujjain.md) | SC | Anil Firojiya | BJP | none declared | [open →](https://kaun.city/india/c/23-22) |
| `23-23` | [Mandsour](23-23-mandsour.md) | — | Sudheer Gupta | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/23-23) |
| `23-24` | [Ratlam](23-24-ratlam.md) | ST | Anita Nagarsingh Chouhan | BJP | none declared | [open →](https://kaun.city/india/c/23-24) |
| `23-25` | [Dhar](23-25-dhar.md) | ST | Savitri Thakur ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/23-25) |
| `23-26` | [Indore](23-26-indore.md) | — | Shankar Lalwani | BJP | none declared | [open →](https://kaun.city/india/c/23-26) |
| `23-27` | [Khargone](23-27-khargone.md) | ST | Gajendra Singh Patel | BJP | none declared | [open →](https://kaun.city/india/c/23-27) |
| `23-28` | [Khandwa](23-28-khandwa.md) | — | Gyaneshwar Patil | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/23-28) |
| `23-29` | [Betul](23-29-betul.md) | ST | Durgadas D D Uikey ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/23-29) |

### Maharashtra

48 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `27-1` | [Nandurbar](27-1-nandurbar.md) | ST | Gowaal Kagada Padavi | INC | none declared | [open →](https://kaun.city/india/c/27-1) |
| `27-2` | [Dhule](27-2-dhule.md) | — | Bachhav Shobha Dinesh | INC | ⚠ 2 | [open →](https://kaun.city/india/c/27-2) |
| `27-3` | [Jalgaon](27-3-jalgaon.md) | — | Smita Uday Wagh | BJP | none declared | [open →](https://kaun.city/india/c/27-3) |
| `27-4` | [Raver](27-4-raver.md) | — | Raksha Nikhil Khadse ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/27-4) |
| `27-5` | [Buldhana](27-5-buldhana.md) | — | Prataprao Ganpatrao Jadhav ·&nbsp;minister | SS | ⚠ 2 | [open →](https://kaun.city/india/c/27-5) |
| `27-6` | [Akola](27-6-akola.md) | — | Anup Sanjay Dhotre | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/27-6) |
| `27-7` | [Amravati](27-7-amravati.md) | SC | Balwant Baswant Wankhade | INC | ⚠ 1 | [open →](https://kaun.city/india/c/27-7) |
| `27-8` | [Wardha](27-8-wardha.md) | — | Amar Sharadrao Kale | NCPSP | none declared | [open →](https://kaun.city/india/c/27-8) |
| `27-9` | [Ramtek](27-9-ramtek.md) | SC | Shyamkumar Daulat Barve | INC | ⚠ 2 | [open →](https://kaun.city/india/c/27-9) |
| `27-10` | [Nagpur](27-10-nagpur.md) | — | Nitin Jairam Gadkari ·&nbsp;minister | BJP | ⚠ 10 | [open →](https://kaun.city/india/c/27-10) |
| `27-11` | [Bhandara-Gondiya](27-11-bhandara-gondiya.md) | — | Prashant Yadaorao Padole | INC | none declared | [open →](https://kaun.city/india/c/27-11) |
| `27-12` | [Gadchiroli-Chimur](27-12-gadchiroli-chimur.md) | ST | Kirsan Namdeo | INC | none declared | [open →](https://kaun.city/india/c/27-12) |
| `27-13` | [Chandrapur](27-13-chandrapur.md) | — | Dhanorkar Pratibha Suresh | INC | none declared | [open →](https://kaun.city/india/c/27-13) |
| `27-14` | [Yavatmal-Washim](27-14-yavatmal-washim.md) | — | Sanjay Uttamrao Deshmukh | SS | none declared | [open →](https://kaun.city/india/c/27-14) |
| `27-15` | [Hingoli](27-15-hingoli.md) | — | Aashtikar Patil Nagesh Bapurao | SS | none declared | [open →](https://kaun.city/india/c/27-15) |
| `27-16` | [Nanded](27-16-nanded.md) | — | Chavan Ravindra Vasantrao | INC | ⚠ 1 | [open →](https://kaun.city/india/c/27-16) |
| `27-17` | [Parbhani](27-17-parbhani.md) | — | Sanjay Haribhau Jadhav | SS | ⚠ 6 | [open →](https://kaun.city/india/c/27-17) |
| `27-18` | [Jalna](27-18-jalna.md) | — | Kalyan Vaijinathrao Kale | INC | ⚠ 2 | [open →](https://kaun.city/india/c/27-18) |
| `27-19` | [Aurangabad](27-19-aurangabad.md) | — | Bhumare Sandipanrao Asaram | SS | ⚠ 4 | [open →](https://kaun.city/india/c/27-19) |
| `27-20` | [Dindori](27-20-dindori.md) | ST | Bhaskar Murlidhar Bhagare | NCPSP | none declared | [open →](https://kaun.city/india/c/27-20) |
| `27-21` | [Nashik](27-21-nashik.md) | — | Rajabhau Parag Prakash Waje | SHSUBT | none declared | [open →](https://kaun.city/india/c/27-21) |
| `27-22` | [Palghar](27-22-palghar.md) | ST | Hemant Vishnu Savara | BJP | none declared | [open →](https://kaun.city/india/c/27-22) |
| `27-23` | [Bhiwandi](27-23-bhiwandi.md) | — | Balya Mama Suresh Gopinath Mhatre | NCPSP | none declared | [open →](https://kaun.city/india/c/27-23) |
| `27-24` | [Kalyan](27-24-kalyan.md) | — | Shrikant Eknath Shinde | SS | none declared | [open →](https://kaun.city/india/c/27-24) |
| `27-25` | [Thane](27-25-thane.md) | — | Naresh Ganpat Mhaske | SS | ⚠ 2 | [open →](https://kaun.city/india/c/27-25) |
| `27-26` | [Mumbai North](27-26-mumbai-north.md) | — | Piyush Vedprakash Goyal ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/27-26) |
| `27-27` | [Mumbai North-West](27-27-mumbai-north-west.md) | — | Ravindra Dattaram Waikar | SS | ⚠ 3 | [open →](https://kaun.city/india/c/27-27) |
| `27-28` | [Mumbai North-East](27-28-mumbai-north-east.md) | — | Sanjay Dina Patil | SS | none declared | [open →](https://kaun.city/india/c/27-28) |
| `27-29` | [Mumbai North-Central](27-29-mumbai-north-central.md) | — | Varsha Eknath Gaikwad | INC | ⚠ 7 | [open →](https://kaun.city/india/c/27-29) |
| `27-30` | [Mumbai South -Central](27-30-mumbai-south-central.md) | — | Anil Yeshwant Desai | SHSUBT | none declared | [open →](https://kaun.city/india/c/27-30) |
| `27-31` | [Mumbai South](27-31-mumbai-south.md) | — | Arvind Ganpat Sawant | SHSUBT | ⚠ 1 | [open →](https://kaun.city/india/c/27-31) |
| `27-32` | [Raigad](27-32-raigad.md) | — | Tatkare Sunil Dattatrey | NCP | none declared | [open →](https://kaun.city/india/c/27-32) |
| `27-33` | [Maval](27-33-maval.md) | — | Shrirang Appa Chandu Barne | SS | ⚠ 3 | [open →](https://kaun.city/india/c/27-33) |
| `27-34` | [Pune](27-34-pune.md) | — | Murlidhar Mohol ·&nbsp;minister | BJP | ⚠ 3 | [open →](https://kaun.city/india/c/27-34) |
| `27-35` | [Baramati](27-35-baramati.md) | — | Supriya Sule | NCPSP | none declared | [open →](https://kaun.city/india/c/27-35) |
| `27-36` | [Shirur](27-36-shirur.md) | — | Amol Ramsing Kolhe | NCPSP | none declared | [open →](https://kaun.city/india/c/27-36) |
| `27-37` | [Ahmednagar](27-37-ahmednagar.md) | — | Nilesh Dnyandev Lanke | NCPSP | ⚠ 2 | [open →](https://kaun.city/india/c/27-37) |
| `27-38` | [Shirdi](27-38-shirdi.md) | SC | Bhausaheb Rajaram Wakchaure | SS | none declared | [open →](https://kaun.city/india/c/27-38) |
| `27-39` | [Beed](27-39-beed.md) | — | Bajrang Manohar Sonwane | NCPSP | none declared | [open →](https://kaun.city/india/c/27-39) |
| `27-40` | [Osmanabad](27-40-osmanabad.md) | — | Omprakash Bhupalsinh Alias Pavan Rajenimbalkar | SS | ⚠ 2 | [open →](https://kaun.city/india/c/27-40) |
| `27-41` | [Latur](27-41-latur.md) | SC | Shivaji Bandappa Kalge | INC | none declared | [open →](https://kaun.city/india/c/27-41) |
| `27-42` | [Solapur](27-42-solapur.md) | SC | Praniti Sushilkumar Shinde | INC | ⚠ 3 | [open →](https://kaun.city/india/c/27-42) |
| `27-43` | [Madha](27-43-madha.md) | — | Mohite Patil Dhairyasheel Rajsinh | NCPSP | ⚠ 36 | [open →](https://kaun.city/india/c/27-43) |
| `27-44` | [Sangli](27-44-sangli.md) | — | Vishaldada Prakashbapu Patil | Ind. | ⚠ 9 | [open →](https://kaun.city/india/c/27-44) |
| `27-45` | [Satara](27-45-satara.md) | — | Udayanraje Pratapsinha Maharaj Bhonsle | BJP | ⚠ 4 | [open →](https://kaun.city/india/c/27-45) |
| `27-46` | [Ratnagiri -Sindhudurg](27-46-ratnagiri-sindhudurg.md) | — | Narayan Tatu Rane | BJP | ⚠ 7 | [open →](https://kaun.city/india/c/27-46) |
| `27-47` | [Kolhapur](27-47-kolhapur.md) | — | Shahu Shahaji Chhatrapati | INC | ⚠ 1 | [open →](https://kaun.city/india/c/27-47) |
| `27-48` | [Hatkanangle](27-48-hatkanangle.md) | — | Dhairyasheel Sambhajirao Mane | SS | none declared | [open →](https://kaun.city/india/c/27-48) |

### Manipur

2 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `14-1` | [Inner Manipur](14-1-inner-manipur.md) | — | Angomcha Bimol Akoijam | INC | none declared | [open →](https://kaun.city/india/c/14-1) |
| `14-2` | [Outer Manipur](14-2-outer-manipur.md) | ST | Alfred Kanngam S Arthur | INC | none declared | [open →](https://kaun.city/india/c/14-2) |

### Meghalaya

2 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `17-1` | [Shillong](17-1-shillong.md) | ST | _vacant — bypoll pending_ | — | none declared | [open →](https://kaun.city/india/c/17-1) |
| `17-2` | [Tura](17-2-tura.md) | ST | Saleng A Sangma | INC | none declared | [open →](https://kaun.city/india/c/17-2) |

### Mizoram

1 seat.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `15-1` | [Mizoram](15-1-mizoram.md) | ST | Richard Vanlalhmangaiha | ZPM | none declared | [open →](https://kaun.city/india/c/15-1) |

### Nagaland

1 seat.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `13-1` | [Nagaland](13-1-nagaland.md) | — | S Supongmeren Jamir | INC | none declared | [open →](https://kaun.city/india/c/13-1) |

### Odisha

21 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `21-1` | [Bargarh](21-1-bargarh.md) | — | Pradeep Purohit | BJP | ⚠ 8 | [open →](https://kaun.city/india/c/21-1) |
| `21-2` | [Sundargarh](21-2-sundargarh.md) | ST | Jual Oram ·&nbsp;minister | BJP | ⚠ 3 | [open →](https://kaun.city/india/c/21-2) |
| `21-3` | [Sambalpur](21-3-sambalpur.md) | — | Dharmendra Pradhan | BJP | ⚠ 5 | [open →](https://kaun.city/india/c/21-3) |
| `21-4` | [Keonjhar](21-4-keonjhar.md) | ST | Ananta Nayak | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/21-4) |
| `21-5` | [Mayurbhanj](21-5-mayurbhanj.md) | ST | Naba Charan Majhi | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/21-5) |
| `21-6` | [Balasore](21-6-balasore.md) | — | Pratap Chandra Sarangi | BJP | ⚠ 9 | [open →](https://kaun.city/india/c/21-6) |
| `21-7` | [Bhadrak](21-7-bhadrak.md) | SC | Avimanyu Sethi | BJP | none declared | [open →](https://kaun.city/india/c/21-7) |
| `21-8` | [Jajpur](21-8-jajpur.md) | SC | Rabindra Narayan Behera | BJP | none declared | [open →](https://kaun.city/india/c/21-8) |
| `21-9` | [Dhenkanal](21-9-dhenkanal.md) | — | Rudra Narayan Pany | BJP | ⚠ 8 | [open →](https://kaun.city/india/c/21-9) |
| `21-10` | [Bolangir](21-10-bolangir.md) | — | Sangeeta Kumari Singh Deo | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/21-10) |
| `21-11` | [Kalahandi](21-11-kalahandi.md) | — | Malvika Devi | BJP | none declared | [open →](https://kaun.city/india/c/21-11) |
| `21-12` | [Nabarangpur](21-12-nabarangpur.md) | ST | Balabhadra Majhi | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/21-12) |
| `21-13` | [Kandhamal](21-13-kandhamal.md) | — | Sukanta Kumar Panigrahi | BJP | ⚠ 4 | [open →](https://kaun.city/india/c/21-13) |
| `21-14` | [Cuttack](21-14-cuttack.md) | — | Bhartruhari Mahtab | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/21-14) |
| `21-15` | [Kendrapara](21-15-kendrapara.md) | — | Baijayant Panda | BJP | ⚠ 8 | [open →](https://kaun.city/india/c/21-15) |
| `21-16` | [Jagatsinghpur](21-16-jagatsinghpur.md) | SC | Bibhu Prasad Tarai | BJP | ⚠ 3 | [open →](https://kaun.city/india/c/21-16) |
| `21-17` | [Puri](21-17-puri.md) | — | Sambit Patra | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/21-17) |
| `21-18` | [Bhubaneswar](21-18-bhubaneswar.md) | — | Aparajita Sarangi | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/21-18) |
| `21-19` | [Aska](21-19-aska.md) | — | Anita Subhadarshini | BJP | none declared | [open →](https://kaun.city/india/c/21-19) |
| `21-20` | [Berhampur](21-20-berhampur.md) | — | Pradeep Kumar Panigrahy | BJP | ⚠ 9 | [open →](https://kaun.city/india/c/21-20) |
| `21-21` | [Koraput](21-21-koraput.md) | ST | Saptagiri Sankar Ulaka | INC | none declared | [open →](https://kaun.city/india/c/21-21) |

### Puducherry

1 seat.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `34-1` | [Pondicherry](34-1-pondicherry.md) | — | Ve Vaithilingam | INC | none declared | [open →](https://kaun.city/india/c/34-1) |

### Punjab

13 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `3-1` | [Gurdaspur](3-1-gurdaspur.md) | — | Sukhjinder Singh Randhawa | INC | none declared | [open →](https://kaun.city/india/c/3-1) |
| `3-2` | [Amritsar](3-2-amritsar.md) | — | Gurjeet Singh Aujla | INC | none declared | [open →](https://kaun.city/india/c/3-2) |
| `3-3` | [Khadoor Sahib](3-3-khadoor-sahib.md) | — | Amritpal Singh | Ind. | ⚠ 12 | [open →](https://kaun.city/india/c/3-3) |
| `3-4` | [Jalandhar](3-4-jalandhar.md) | SC | Charanjit Singh Channi | INC | none declared | [open →](https://kaun.city/india/c/3-4) |
| `3-5` | [Hoshiarpur](3-5-hoshiarpur.md) | SC | Raj Kumar Chabbewal | AAP | none declared | [open →](https://kaun.city/india/c/3-5) |
| `3-6` | [Anandpur Sahib](3-6-anandpur-sahib.md) | — | Malvinder Singh Kang | AAP | none declared | [open →](https://kaun.city/india/c/3-6) |
| `3-7` | [Ludhiana](3-7-ludhiana.md) | — | Amrinder Singh Raja Warring | INC | none declared | [open →](https://kaun.city/india/c/3-7) |
| `3-8` | [Fatehgarh Sahib](3-8-fatehgarh-sahib.md) | SC | Amar Singh | INC | none declared | [open →](https://kaun.city/india/c/3-8) |
| `3-9` | [Faridkot](3-9-faridkot.md) | SC | Sarabjeet Singh Khalsa | Ind. | none declared | [open →](https://kaun.city/india/c/3-9) |
| `3-10` | [Firozpur](3-10-firozpur.md) | — | Sher Singh Ghubaya | INC | none declared | [open →](https://kaun.city/india/c/3-10) |
| `3-11` | [Bathinda](3-11-bathinda.md) | — | Harsimrat Kaur Badal | SAD | none declared | [open →](https://kaun.city/india/c/3-11) |
| `3-12` | [Sangrur](3-12-sangrur.md) | — | Gurmeet Singh Meet Hayer | AAP | ⚠ 2 | [open →](https://kaun.city/india/c/3-12) |
| `3-13` | [Patiala](3-13-patiala.md) | — | Dharamvira Gandhi | INC | none declared | [open →](https://kaun.city/india/c/3-13) |

### Rajasthan

25 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `8-1` | [Ganganagar](8-1-ganganagar.md) | SC | Kuldeep Indora | INC | none declared | [open →](https://kaun.city/india/c/8-1) |
| `8-2` | [Bikaner](8-2-bikaner.md) | SC | Arjun Ram Meghwal ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/8-2) |
| `8-3` | [Churu](8-3-churu.md) | — | Rahul Kaswan | INC | none declared | [open →](https://kaun.city/india/c/8-3) |
| `8-4` | [Jhunjhunu](8-4-jhunjhunu.md) | — | Brijendra Singh Ola | INC | none declared | [open →](https://kaun.city/india/c/8-4) |
| `8-5` | [Sikar](8-5-sikar.md) | — | Amra Ram | CPI(M) | none declared | [open →](https://kaun.city/india/c/8-5) |
| `8-6` | [Jaipur Rural](8-6-jaipur-rural.md) | — | Rao Rajendra Singh | BJP | none declared | [open →](https://kaun.city/india/c/8-6) |
| `8-7` | [Jaipur](8-7-jaipur.md) | — | Manju Sharma | BJP | none declared | [open →](https://kaun.city/india/c/8-7) |
| `8-8` | [Alwar](8-8-alwar.md) | — | Bhupender Yadav ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/8-8) |
| `8-9` | [Bharatpur](8-9-bharatpur.md) | SC | Sanjna Jatav | INC | none declared | [open →](https://kaun.city/india/c/8-9) |
| `8-10` | [Karauli -Dholpur](8-10-karauli-dholpur.md) | SC | Bhajan Lal Jatav | INC | ⚠ 1 | [open →](https://kaun.city/india/c/8-10) |
| `8-11` | [Dausa](8-11-dausa.md) | ST | Murari Lal Meena | INC | none declared | [open →](https://kaun.city/india/c/8-11) |
| `8-12` | [Tonk - Sawai Madhopur](8-12-tonk-sawai-madhopur.md) | — | Harish Chandra Meena | INC | none declared | [open →](https://kaun.city/india/c/8-12) |
| `8-13` | [Ajmer](8-13-ajmer.md) | — | Bhagirath Choudhary ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/8-13) |
| `8-14` | [Nagaur](8-14-nagaur.md) | — | Hanuman Beniwal | RLP | ⚠ 1 | [open →](https://kaun.city/india/c/8-14) |
| `8-15` | [Pali](8-15-pali.md) | — | P P Chaudhary | BJP | none declared | [open →](https://kaun.city/india/c/8-15) |
| `8-16` | [Jodhpur](8-16-jodhpur.md) | — | Gajendra Singh Shekhawat ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/8-16) |
| `8-17` | [Barmer](8-17-barmer.md) | — | Ummeda Ram Beniwal | INC | none declared | [open →](https://kaun.city/india/c/8-17) |
| `8-18` | [Jalore](8-18-jalore.md) | — | Lumbaram Choudhary | BJP | none declared | [open →](https://kaun.city/india/c/8-18) |
| `8-19` | [Udaipur](8-19-udaipur.md) | ST | Manna Lal Rawat | BJP | none declared | [open →](https://kaun.city/india/c/8-19) |
| `8-20` | [Banswara](8-20-banswara.md) | ST | Rajkumar Roat | BAP | ⚠ 1 | [open →](https://kaun.city/india/c/8-20) |
| `8-21` | [Chittorgarh](8-21-chittorgarh.md) | — | Chandra Prakash Joshi | BJP | none declared | [open →](https://kaun.city/india/c/8-21) |
| `8-22` | [Rajsamand](8-22-rajsamand.md) | — | Mahima Kumari Mewar | BJP | none declared | [open →](https://kaun.city/india/c/8-22) |
| `8-23` | [Bhilwara](8-23-bhilwara.md) | — | Damodar Agrawal | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/8-23) |
| `8-24` | [Kota](8-24-kota.md) | — | Om Birla | BJP | none declared | [open →](https://kaun.city/india/c/8-24) |
| `8-25` | [Jhalawar-Baran](8-25-jhalawar-baran.md) | — | Dushyant Singh | BJP | none declared | [open →](https://kaun.city/india/c/8-25) |

### Sikkim

1 seat.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `11-1` | [Sikkim](11-1-sikkim.md) | — | Indra Hang Subba | SKM | none declared | [open →](https://kaun.city/india/c/11-1) |

### Tamil Nadu

39 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `33-1` | [Tiruvallur](33-1-tiruvallur.md) | SC | Sasikanth Senthil | INC | none declared | [open →](https://kaun.city/india/c/33-1) |
| `33-2` | [Chennai North](33-2-chennai-north.md) | — | Kalanidhi Veeraswamy | DMK | none declared | [open →](https://kaun.city/india/c/33-2) |
| `33-3` | [Chennai South](33-3-chennai-south.md) | — | T Sumathy Alias Thamizhachi Thangapandian | DMK | none declared | [open →](https://kaun.city/india/c/33-3) |
| `33-4` | [Chennai Central](33-4-chennai-central.md) | — | Dayanidhi Maran | DMK | ⚠ 4 | [open →](https://kaun.city/india/c/33-4) |
| `33-5` | [Sriperumbudur](33-5-sriperumbudur.md) | — | T R Baalu | DMK | none declared | [open →](https://kaun.city/india/c/33-5) |
| `33-6` | [Kancheepuram](33-6-kancheepuram.md) | SC | Selvam G | DMK | none declared | [open →](https://kaun.city/india/c/33-6) |
| `33-7` | [Arakkonam](33-7-arakkonam.md) | — | Dr. S Jagathratchakan | DMK | ⚠ 2 | [open →](https://kaun.city/india/c/33-7) |
| `33-8` | [Vellore](33-8-vellore.md) | — | D M Kathir Anand | DMK | ⚠ 5 | [open →](https://kaun.city/india/c/33-8) |
| `33-9` | [Krishnagiri](33-9-krishnagiri.md) | — | K Gopinath | INC | none declared | [open →](https://kaun.city/india/c/33-9) |
| `33-10` | [Dharmapuri](33-10-dharmapuri.md) | — | Mani A | DMK | ⚠ 1 | [open →](https://kaun.city/india/c/33-10) |
| `33-11` | [Tiruvannamalai](33-11-tiruvannamalai.md) | — | C N Annadurai | DMK | none declared | [open →](https://kaun.city/india/c/33-11) |
| `33-12` | [Arani](33-12-arani.md) | — | Tharaniventhan M S | DMK | none declared | [open →](https://kaun.city/india/c/33-12) |
| `33-13` | [Viluppuram](33-13-viluppuram.md) | SC | D Ravi Kumar | VCK | none declared | [open →](https://kaun.city/india/c/33-13) |
| `33-14` | [Kallakurichi](33-14-kallakurichi.md) | — | Malaiyarasan D | DMK | ⚠ 4 | [open →](https://kaun.city/india/c/33-14) |
| `33-15` | [Salem](33-15-salem.md) | — | Selvaganapathi T.M. | DMK | ⚠ 1 | [open →](https://kaun.city/india/c/33-15) |
| `33-16` | [Namakkal](33-16-namakkal.md) | — | Matheswaran V S | DMK | ⚠ 3 | [open →](https://kaun.city/india/c/33-16) |
| `33-17` | [Erode](33-17-erode.md) | — | K E Prakash | DMK | none declared | [open →](https://kaun.city/india/c/33-17) |
| `33-18` | [Tiruppur](33-18-tiruppur.md) | — | Subbarayan K | CPI | ⚠ 1 | [open →](https://kaun.city/india/c/33-18) |
| `33-19` | [Nilgiris](33-19-nilgiris.md) | SC | Raja A | DMK | ⚠ 7 | [open →](https://kaun.city/india/c/33-19) |
| `33-20` | [Coimbatore](33-20-coimbatore.md) | — | Ganapathy Rajkumar P | DMK | ⚠ 1 | [open →](https://kaun.city/india/c/33-20) |
| `33-21` | [Pollachi](33-21-pollachi.md) | — | Eswarasamy K | DMK | ⚠ 1 | [open →](https://kaun.city/india/c/33-21) |
| `33-22` | [Dindigul](33-22-dindigul.md) | — | Sachithanantham R | CPI(M) | ⚠ 9 | [open →](https://kaun.city/india/c/33-22) |
| `33-23` | [Karur](33-23-karur.md) | — | S Jothimani | INC | ⚠ 1 | [open →](https://kaun.city/india/c/33-23) |
| `33-24` | [Tiruchirappalli](33-24-tiruchirappalli.md) | — | Durai Vaiko | MDMK | none declared | [open →](https://kaun.city/india/c/33-24) |
| `33-25` | [Perambalur](33-25-perambalur.md) | — | Arun Nehru | DMK | none declared | [open →](https://kaun.city/india/c/33-25) |
| `33-26` | [Cuddalore](33-26-cuddalore.md) | — | M K Vishnu Prasad | INC | ⚠ 1 | [open →](https://kaun.city/india/c/33-26) |
| `33-27` | [Chidambaram](33-27-chidambaram.md) | SC | Thirumaavalavan Tholkappiyan | VCK | ⚠ 7 | [open →](https://kaun.city/india/c/33-27) |
| `33-28` | [Mayiladuthurai](33-28-mayiladuthurai.md) | — | Sudha R | INC | ⚠ 10 | [open →](https://kaun.city/india/c/33-28) |
| `33-29` | [Nagapattinam](33-29-nagapattinam.md) | SC | Selvaraj V | CPI | ⚠ 1 | [open →](https://kaun.city/india/c/33-29) |
| `33-30` | [Thanjavur](33-30-thanjavur.md) | — | Murasoli S | DMK | ⚠ 6 | [open →](https://kaun.city/india/c/33-30) |
| `33-31` | [Sivaganga](33-31-sivaganga.md) | — | Karti P Chidambaram | INC | ⚠ 11 | [open →](https://kaun.city/india/c/33-31) |
| `33-32` | [Madurai](33-32-madurai.md) | — | S Venkatesan | CPI(M) | ⚠ 3 | [open →](https://kaun.city/india/c/33-32) |
| `33-33` | [Theni](33-33-theni.md) | — | Thanga Tamilselvan | DMK | ⚠ 17 | [open →](https://kaun.city/india/c/33-33) |
| `33-34` | [Virudhunagar](33-34-virudhunagar.md) | — | Manickam Tagore B | INC | ⚠ 1 | [open →](https://kaun.city/india/c/33-34) |
| `33-35` | [Ramanathapuram](33-35-ramanathapuram.md) | — | Navaskani K | IUML | ⚠ 1 | [open →](https://kaun.city/india/c/33-35) |
| `33-36` | [Thoothukkudi](33-36-thoothukkudi.md) | — | Kanimozhi Rajathi Karunanidhi | DMK | ⚠ 2 | [open →](https://kaun.city/india/c/33-36) |
| `33-37` | [Tenkasi](33-37-tenkasi.md) | SC | Rani Srikumar | DMK | none declared | [open →](https://kaun.city/india/c/33-37) |
| `33-38` | [Tirunelveli](33-38-tirunelveli.md) | — | Robert Bruce C | INC | ⚠ 1 | [open →](https://kaun.city/india/c/33-38) |
| `33-39` | [Kanniyakumari](33-39-kanniyakumari.md) | — | Vijayakumar Alias Vijay Vasanth | INC | ⚠ 8 | [open →](https://kaun.city/india/c/33-39) |

### Telangana

17 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `36-1` | [Adilabad](36-1-adilabad.md) | ST | Godam Nagesh | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/36-1) |
| `36-2` | [Peddapalle](36-2-peddapalle.md) | SC | Vamsi Krishna Gaddam | INC | none declared | [open →](https://kaun.city/india/c/36-2) |
| `36-3` | [Karimnagar](36-3-karimnagar.md) | — | Bandi Sanjay Kumar ·&nbsp;minister | BJP | ⚠ 42 | [open →](https://kaun.city/india/c/36-3) |
| `36-4` | [Nizamabad](36-4-nizamabad.md) | — | Arvind Dharmapuri | BJP | ⚠ 22 | [open →](https://kaun.city/india/c/36-4) |
| `36-5` | [Zahirabad](36-5-zahirabad.md) | — | Suresh Kumar Shetkar | INC | ⚠ 1 | [open →](https://kaun.city/india/c/36-5) |
| `36-6` | [Medak](36-6-medak.md) | — | Madhavaneni Raghunandan Rao | BJP | ⚠ 29 | [open →](https://kaun.city/india/c/36-6) |
| `36-7` | [Malkajgiri](36-7-malkajgiri.md) | — | Eatala Rajender | BJP | ⚠ 45 | [open →](https://kaun.city/india/c/36-7) |
| `36-8` | [Secunderabad](36-8-secunderabad.md) | — | G Kishan Reddy ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/36-8) |
| `36-9` | [Hyderabad](36-9-hyderabad.md) | — | Asaduddin Owaisi | AIMIM | ⚠ 5 | [open →](https://kaun.city/india/c/36-9) |
| `36-10` | [Chevella](36-10-chevella.md) | — | Konda Vishweshwar Reddy | BJP | ⚠ 4 | [open →](https://kaun.city/india/c/36-10) |
| `36-11` | [Mahbubnagar](36-11-mahbubnagar.md) | — | D K Aruna | BJP | ⚠ 6 | [open →](https://kaun.city/india/c/36-11) |
| `36-12` | [Nagarkurnool](36-12-nagarkurnool.md) | SC | Mallu Ravi | INC | ⚠ 6 | [open →](https://kaun.city/india/c/36-12) |
| `36-13` | [Nalgonda](36-13-nalgonda.md) | — | Kunduru Raghuveer | INC | ⚠ 2 | [open →](https://kaun.city/india/c/36-13) |
| `36-14` | [Bhongir](36-14-bhongir.md) | — | Chamala Kiran Kumar Reddy | INC | ⚠ 3 | [open →](https://kaun.city/india/c/36-14) |
| `36-15` | [Warangal](36-15-warangal.md) | SC | Kadiyam Kavya | INC | none declared | [open →](https://kaun.city/india/c/36-15) |
| `36-16` | [Mahabubabad](36-16-mahabubabad.md) | ST | Balram Naik Porika | INC | ⚠ 6 | [open →](https://kaun.city/india/c/36-16) |
| `36-17` | [Khammam](36-17-khammam.md) | — | Ramasahayam Raghuram Reddy | INC | ⚠ 1 | [open →](https://kaun.city/india/c/36-17) |

### Tripura

2 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `16-1` | [Tripura West](16-1-tripura-west.md) | — | Biplab Kumar Deb | BJP | none declared | [open →](https://kaun.city/india/c/16-1) |
| `16-2` | [Tripura East](16-2-tripura-east.md) | ST | Kriti Devi Debbarman | BJP | none declared | [open →](https://kaun.city/india/c/16-2) |

### Uttar Pradesh

80 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `9-1` | [Saharanpur](9-1-saharanpur.md) | — | Imran Masood | INC | ⚠ 8 | [open →](https://kaun.city/india/c/9-1) |
| `9-2` | [Kairana](9-2-kairana.md) | — | Iqra Choudhary | SP | none declared | [open →](https://kaun.city/india/c/9-2) |
| `9-3` | [Muzaffarnagar](9-3-muzaffarnagar.md) | — | Harendra Singh Malik | SP | ⚠ 1 | [open →](https://kaun.city/india/c/9-3) |
| `9-4` | [Bijnor](9-4-bijnor.md) | — | Chandan Chauhan | RLD | ⚠ 3 | [open →](https://kaun.city/india/c/9-4) |
| `9-5` | [Nagina](9-5-nagina.md) | SC | Chandra Shekhar | ASP (KR) | ⚠ 36 | [open →](https://kaun.city/india/c/9-5) |
| `9-6` | [Moradabad](9-6-moradabad.md) | — | Ruchi Vira | SP | none declared | [open →](https://kaun.city/india/c/9-6) |
| `9-7` | [Rampur](9-7-rampur.md) | — | Mohibbullah | SP | ⚠ 3 | [open →](https://kaun.city/india/c/9-7) |
| `9-8` | [Sambhal](9-8-sambhal.md) | — | Zia Ur Rehman | SP | ⚠ 6 | [open →](https://kaun.city/india/c/9-8) |
| `9-9` | [Amroha](9-9-amroha.md) | — | Kanwar Singh Tanwar | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/9-9) |
| `9-10` | [Meerut](9-10-meerut.md) | — | Arun Govil | BJP | none declared | [open →](https://kaun.city/india/c/9-10) |
| `9-11` | [Baghpat](9-11-baghpat.md) | — | Rajkumar Sangwan | RLD | ⚠ 3 | [open →](https://kaun.city/india/c/9-11) |
| `9-12` | [Ghaziabad](9-12-ghaziabad.md) | — | Atul Garg | BJP | none declared | [open →](https://kaun.city/india/c/9-12) |
| `9-13` | [Gautam Buddha Nagar](9-13-gautam-buddha-nagar.md) | — | Mahesh Sharma | BJP | none declared | [open →](https://kaun.city/india/c/9-13) |
| `9-14` | [Bulandshahr](9-14-bulandshahr.md) | SC | Bhola Singh | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/9-14) |
| `9-15` | [Aligarh](9-15-aligarh.md) | — | Satish Kumar Gautam | BJP | none declared | [open →](https://kaun.city/india/c/9-15) |
| `9-16` | [Hathras](9-16-hathras.md) | SC | Anoop Pradhan Valmiki | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/9-16) |
| `9-17` | [Mathura](9-17-mathura.md) | — | Hema Malini | BJP | none declared | [open →](https://kaun.city/india/c/9-17) |
| `9-18` | [Agra](9-18-agra.md) | SC | S P Singh Baghel ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/9-18) |
| `9-19` | [Fatehpur Sikri](9-19-fatehpur-sikri.md) | — | Rajkumar Chahar | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/9-19) |
| `9-20` | [Firozabad](9-20-firozabad.md) | — | Akshay Yadav | SP | ⚠ 3 | [open →](https://kaun.city/india/c/9-20) |
| `9-21` | [Mainpuri](9-21-mainpuri.md) | — | Dimple Yadav | SP | none declared | [open →](https://kaun.city/india/c/9-21) |
| `9-22` | [Etah](9-22-etah.md) | — | Devesh Shakya | SP | ⚠ 1 | [open →](https://kaun.city/india/c/9-22) |
| `9-23` | [Badaun](9-23-badaun.md) | — | Aditya Yadav | SP | none declared | [open →](https://kaun.city/india/c/9-23) |
| `9-24` | [Aonla](9-24-aonla.md) | — | Neeraj Maurya | SP | none declared | [open →](https://kaun.city/india/c/9-24) |
| `9-25` | [Bareilly](9-25-bareilly.md) | — | Chhatrapal Singh Gangwar | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/9-25) |
| `9-26` | [Pilibhit](9-26-pilibhit.md) | — | Jitin Prasada ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/9-26) |
| `9-27` | [Shahjahanpur](9-27-shahjahanpur.md) | SC | Arun Kumar Sagar | BJP | none declared | [open →](https://kaun.city/india/c/9-27) |
| `9-28` | [Kheri](9-28-kheri.md) | — | Utkarsh Verma Madhur | SP | none declared | [open →](https://kaun.city/india/c/9-28) |
| `9-29` | [Dhaurahra](9-29-dhaurahra.md) | — | Anand Bhadauria | SP | ⚠ 4 | [open →](https://kaun.city/india/c/9-29) |
| `9-30` | [Sitapur](9-30-sitapur.md) | — | Rakesh Rathor | INC | ⚠ 1 | [open →](https://kaun.city/india/c/9-30) |
| `9-31` | [Hardoi](9-31-hardoi.md) | SC | Jai Prakash | BJP | none declared | [open →](https://kaun.city/india/c/9-31) |
| `9-32` | [Misrikh](9-32-misrikh.md) | SC | Ashok Kumar Rawat | BJP | none declared | [open →](https://kaun.city/india/c/9-32) |
| `9-33` | [Unnao](9-33-unnao.md) | — | Swami Sachidanand Hari Sakshi | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/9-33) |
| `9-34` | [Mohanlalganj](9-34-mohanlalganj.md) | SC | R K Chaudhary | SP | ⚠ 2 | [open →](https://kaun.city/india/c/9-34) |
| `9-35` | [Lucknow](9-35-lucknow.md) | — | Rajnath Singh ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/9-35) |
| `9-36` | [Rae Bareli](9-36-rae-bareli.md) | — | Rahul Gandhi | INC | ⚠ 18 | [open →](https://kaun.city/india/c/9-36) |
| `9-37` | [Amethi](9-37-amethi.md) | — | Kishori Lal | INC | none declared | [open →](https://kaun.city/india/c/9-37) |
| `9-38` | [Sultanpur](9-38-sultanpur.md) | — | Rambhual Nishad | SP | ⚠ 8 | [open →](https://kaun.city/india/c/9-38) |
| `9-39` | [Pratapgarh](9-39-pratapgarh.md) | — | Shiv Pal Singh Patel | SP | none declared | [open →](https://kaun.city/india/c/9-39) |
| `9-40` | [Farrukhabad](9-40-farrukhabad.md) | — | Mukesh Rajput | BJP | none declared | [open →](https://kaun.city/india/c/9-40) |
| `9-41` | [Etawah](9-41-etawah.md) | SC | Jitendra Kumar Dohare | SP | none declared | [open →](https://kaun.city/india/c/9-41) |
| `9-42` | [Kannauj](9-42-kannauj.md) | — | Akhilesh Yadav | SP | ⚠ 3 | [open →](https://kaun.city/india/c/9-42) |
| `9-43` | [Kanpur](9-43-kanpur.md) | — | Ramesh Awasthi | BJP | none declared | [open →](https://kaun.city/india/c/9-43) |
| `9-44` | [Akbarpur](9-44-akbarpur.md) | — | Devendra Singh Alias Bhole Singh | BJP | ⚠ 13 | [open →](https://kaun.city/india/c/9-44) |
| `9-45` | [Jalaun](9-45-jalaun.md) | SC | Narayandas Ahirwar | SP | none declared | [open →](https://kaun.city/india/c/9-45) |
| `9-46` | [Jhansi](9-46-jhansi.md) | — | Anurag Sharma | BJP | none declared | [open →](https://kaun.city/india/c/9-46) |
| `9-47` | [Hamirpur](9-47-hamirpur.md) | — | Ajendra Singh Lodhi | SP | none declared | [open →](https://kaun.city/india/c/9-47) |
| `9-48` | [Banda](9-48-banda.md) | — | Krishna Devi Shivshankar Patel | SP | none declared | [open →](https://kaun.city/india/c/9-48) |
| `9-49` | [Fatehpur](9-49-fatehpur.md) | — | Naresh Chandra Uttam Patel | SP | none declared | [open →](https://kaun.city/india/c/9-49) |
| `9-50` | [Kaushambi](9-50-kaushambi.md) | SC | Pushpendra Saroj | SP | none declared | [open →](https://kaun.city/india/c/9-50) |
| `9-51` | [Phulpur](9-51-phulpur.md) | — | Praveen Patel | BJP | none declared | [open →](https://kaun.city/india/c/9-51) |
| `9-52` | [Allahabad](9-52-allahabad.md) | — | Ujjwal Raman Singh | INC | none declared | [open →](https://kaun.city/india/c/9-52) |
| `9-53` | [Barabanki](9-53-barabanki.md) | SC | Tanuj Punia | INC | ⚠ 1 | [open →](https://kaun.city/india/c/9-53) |
| `9-54` | [Faizabad](9-54-faizabad.md) | — | Awadhesh Prasad | SP | ⚠ 1 | [open →](https://kaun.city/india/c/9-54) |
| `9-55` | [Ambedkar Nagar](9-55-ambedkar-nagar.md) | — | Lalji Verma | SP | ⚠ 2 | [open →](https://kaun.city/india/c/9-55) |
| `9-56` | [Bahraich](9-56-bahraich.md) | SC | Anand Kumar | BJP | none declared | [open →](https://kaun.city/india/c/9-56) |
| `9-57` | [Kaiserganj](9-57-kaiserganj.md) | — | Karan Bhushan Singh | BJP | none declared | [open →](https://kaun.city/india/c/9-57) |
| `9-58` | [Shrawasti](9-58-shrawasti.md) | — | Ram Shiromani Verma | SP | none declared | [open →](https://kaun.city/india/c/9-58) |
| `9-59` | [Gonda](9-59-gonda.md) | — | Kirti Vardhan Singh ·&nbsp;minister | BJP | ⚠ 3 | [open →](https://kaun.city/india/c/9-59) |
| `9-60` | [Domariyaganj](9-60-domariyaganj.md) | — | Jagdambika Pal | BJP | ⚠ 1 | [open →](https://kaun.city/india/c/9-60) |
| `9-61` | [Basti](9-61-basti.md) | — | Ram Prasad Chaudhary | SP | ⚠ 4 | [open →](https://kaun.city/india/c/9-61) |
| `9-62` | [Sant Kabir Nagar](9-62-sant-kabir-nagar.md) | — | Laxmikant Pappu Nishad | SP | ⚠ 3 | [open →](https://kaun.city/india/c/9-62) |
| `9-63` | [Maharajganj](9-63-maharajganj.md) | — | Pankaj Choudhary ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/9-63) |
| `9-64` | [Gorakhpur](9-64-gorakhpur.md) | — | Ravindra Shukla Alias Ravi Kishan | BJP | none declared | [open →](https://kaun.city/india/c/9-64) |
| `9-65` | [Kushi Nagar](9-65-kushi-nagar.md) | — | Vijay Kumar Dubey | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/9-65) |
| `9-66` | [Deoria](9-66-deoria.md) | — | Shashank Mani | BJP | none declared | [open →](https://kaun.city/india/c/9-66) |
| `9-67` | [Bansgaon](9-67-bansgaon.md) | SC | Kamlesh Paswan ·&nbsp;minister | BJP | ⚠ 9 | [open →](https://kaun.city/india/c/9-67) |
| `9-68` | [Lalganj](9-68-lalganj.md) | SC | Daroga Prasad Saroj | SP | ⚠ 3 | [open →](https://kaun.city/india/c/9-68) |
| `9-69` | [Azamgarh](9-69-azamgarh.md) | — | Dharmendra Yadav | SP | ⚠ 4 | [open →](https://kaun.city/india/c/9-69) |
| `9-70` | [Ghosi](9-70-ghosi.md) | — | Rajeev Rai | SP | ⚠ 1 | [open →](https://kaun.city/india/c/9-70) |
| `9-71` | [Salempur](9-71-salempur.md) | — | Ramashankar Vidharthi Rajbhar | SP | none declared | [open →](https://kaun.city/india/c/9-71) |
| `9-72` | [Ballia](9-72-ballia.md) | — | Sanatan Pandey | SP | ⚠ 2 | [open →](https://kaun.city/india/c/9-72) |
| `9-73` | [Jaunpur](9-73-jaunpur.md) | — | Babu Singh Kushwaha | SP | ⚠ 25 | [open →](https://kaun.city/india/c/9-73) |
| `9-74` | [Machhlishahr](9-74-machhlishahr.md) | SC | Priya Saroj | SP | ⚠ 2 | [open →](https://kaun.city/india/c/9-74) |
| `9-75` | [Ghazipur](9-75-ghazipur.md) | — | Afzal Ansari | SP | ⚠ 5 | [open →](https://kaun.city/india/c/9-75) |
| `9-76` | [Chandauli](9-76-chandauli.md) | — | Virendra Singh | SP | ⚠ 3 | [open →](https://kaun.city/india/c/9-76) |
| `9-77` | [Varanasi](9-77-varanasi.md) | — | Narendra Modi ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/9-77) |
| `9-78` | [Bhadohi](9-78-bhadohi.md) | — | Vinod Kumar Bind | BJP | none declared | [open →](https://kaun.city/india/c/9-78) |
| `9-79` | [Mirzapur](9-79-mirzapur.md) | — | Anupriya Patel ·&nbsp;minister | Apna Dal (S) | ⚠ 2 | [open →](https://kaun.city/india/c/9-79) |
| `9-80` | [Robertsganj](9-80-robertsganj.md) | SC | Chhotelal | SP | none declared | [open →](https://kaun.city/india/c/9-80) |

### Uttarakhand

5 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `5-1` | [Tehri Garhwal](5-1-tehri-garhwal.md) | — | Mala Rajya Laxmi Shah | BJP | none declared | [open →](https://kaun.city/india/c/5-1) |
| `5-2` | [Garhwal](5-2-garhwal.md) | — | Anil Baluni | BJP | none declared | [open →](https://kaun.city/india/c/5-2) |
| `5-3` | [Almora](5-3-almora.md) | SC | Ajay Tamta ·&nbsp;minister | BJP | none declared | [open →](https://kaun.city/india/c/5-3) |
| `5-4` | [Nainital-Udhamsingh Nagar](5-4-nainital-udhamsingh-nagar.md) | — | Ajay Bhatt | BJP | none declared | [open →](https://kaun.city/india/c/5-4) |
| `5-5` | [Hardwar](5-5-hardwar.md) | — | Trivendra Singh Rawat | BJP | none declared | [open →](https://kaun.city/india/c/5-5) |

### West Bengal

42 seats.

| Seat | Constituency | Reserved | Sitting MP | Party | Declared cases | Live |
|---|---|---|---|---|---|---|
| `19-1` | [Coochbehar](19-1-coochbehar.md) | SC | Jagadish Chandra Barma Basunia | AITC | ⚠ 1 | [open →](https://kaun.city/india/c/19-1) |
| `19-2` | [Alipurduars](19-2-alipurduars.md) | ST | Manoj Tigga | BJP | ⚠ 6 | [open →](https://kaun.city/india/c/19-2) |
| `19-3` | [Jalpaiguri](19-3-jalpaiguri.md) | SC | Jayanta Kumar Roy | BJP | none declared | [open →](https://kaun.city/india/c/19-3) |
| `19-4` | [Darjeeling](19-4-darjeeling.md) | — | Raju Bista | BJP | ⚠ 2 | [open →](https://kaun.city/india/c/19-4) |
| `19-5` | [Raiganj](19-5-raiganj.md) | — | Kartick Chandra Paul | BJP | none declared | [open →](https://kaun.city/india/c/19-5) |
| `19-6` | [Balurghat](19-6-balurghat.md) | — | Sukanta Majumdar ·&nbsp;minister | BJP | ⚠ 16 | [open →](https://kaun.city/india/c/19-6) |
| `19-7` | [Maldaha Uttar](19-7-maldaha-uttar.md) | — | Khagen Murmu | BJP | ⚠ 7 | [open →](https://kaun.city/india/c/19-7) |
| `19-8` | [Maldaha Dakshin](19-8-maldaha-dakshin.md) | — | Isha Khan Choudhury | INC | none declared | [open →](https://kaun.city/india/c/19-8) |
| `19-9` | [Jangipur](19-9-jangipur.md) | — | Khalilur Rahaman | AITC | none declared | [open →](https://kaun.city/india/c/19-9) |
| `19-10` | [Baharampur](19-10-baharampur.md) | — | Pathan Yusuf | AITC | none declared | [open →](https://kaun.city/india/c/19-10) |
| `19-11` | [Murshidabad](19-11-murshidabad.md) | — | Abu Taher Khan | AITC | ⚠ 3 | [open →](https://kaun.city/india/c/19-11) |
| `19-12` | [Krishnanagar](19-12-krishnanagar.md) | — | Mahua Moitra | AITC | ⚠ 1 | [open →](https://kaun.city/india/c/19-12) |
| `19-13` | [Ranaghat](19-13-ranaghat.md) | SC | Jagannath Sarkar | BJP | ⚠ 4 | [open →](https://kaun.city/india/c/19-13) |
| `19-14` | [Bangaon](19-14-bangaon.md) | SC | Shantanu Thakur ·&nbsp;minister | BJP | ⚠ 23 | [open →](https://kaun.city/india/c/19-14) |
| `19-15` | [Barrackpur](19-15-barrackpur.md) | — | Partha Bhowmick | AITC | ⚠ 2 | [open →](https://kaun.city/india/c/19-15) |
| `19-16` | [Dum Dum](19-16-dum-dum.md) | — | Sougata Ray | AITC | ⚠ 1 | [open →](https://kaun.city/india/c/19-16) |
| `19-17` | [Barasat](19-17-barasat.md) | — | Kakoli Ghosh Dastidar | AITC | ⚠ 2 | [open →](https://kaun.city/india/c/19-17) |
| `19-18` | [Basirhat](19-18-basirhat.md) | — | _vacant — bypoll pending_ | — | none declared | [open →](https://kaun.city/india/c/19-18) |
| `19-19` | [Jaynagar](19-19-jaynagar.md) | SC | Pratima Mondal | AITC | none declared | [open →](https://kaun.city/india/c/19-19) |
| `19-20` | [Mathurapur](19-20-mathurapur.md) | SC | Bapi Haldar | AITC | ⚠ 1 | [open →](https://kaun.city/india/c/19-20) |
| `19-21` | [Diamond Harbour](19-21-diamond-harbour.md) | — | Abhishek Banerjee | AITC | ⚠ 2 | [open →](https://kaun.city/india/c/19-21) |
| `19-22` | [Jadavpur](19-22-jadavpur.md) | — | Sayani Ghosh | AITC | ⚠ 1 | [open →](https://kaun.city/india/c/19-22) |
| `19-23` | [Kolkata Dakshin](19-23-kolkata-dakshin.md) | — | Mala Roy | AITC | ⚠ 1 | [open →](https://kaun.city/india/c/19-23) |
| `19-24` | [Kolkata Uttar](19-24-kolkata-uttar.md) | — | Sudip Bandyopadhyay | AITC | ⚠ 2 | [open →](https://kaun.city/india/c/19-24) |
| `19-25` | [Howrah](19-25-howrah.md) | — | Prasun Banerjee | AITC | ⚠ 1 | [open →](https://kaun.city/india/c/19-25) |
| `19-26` | [Uluberia](19-26-uluberia.md) | — | Sajda Ahmed | AITC | none declared | [open →](https://kaun.city/india/c/19-26) |
| `19-27` | [Sreerampur](19-27-sreerampur.md) | — | Kalyan Banerjee | AITC | none declared | [open →](https://kaun.city/india/c/19-27) |
| `19-28` | [Hooghly](19-28-hooghly.md) | — | Rachna Banerjee | AITC | none declared | [open →](https://kaun.city/india/c/19-28) |
| `19-29` | [Arambag](19-29-arambag.md) | SC | Bag Mitali | AITC | none declared | [open →](https://kaun.city/india/c/19-29) |
| `19-30` | [Tamluk](19-30-tamluk.md) | — | Abhijit Gangopadhyay | BJP | none declared | [open →](https://kaun.city/india/c/19-30) |
| `19-31` | [Kanthi](19-31-kanthi.md) | — | Adhikari Soumendu | BJP | ⚠ 6 | [open →](https://kaun.city/india/c/19-31) |
| `19-32` | [Ghatal](19-32-ghatal.md) | — | Adhikari Deepak Dev | AITC | none declared | [open →](https://kaun.city/india/c/19-32) |
| `19-33` | [Jhargram](19-33-jhargram.md) | ST | Kalipada Saren Kherwal | AITC | none declared | [open →](https://kaun.city/india/c/19-33) |
| `19-34` | [Medinipur](19-34-medinipur.md) | — | June Maliah | AITC | none declared | [open →](https://kaun.city/india/c/19-34) |
| `19-35` | [Purulia](19-35-purulia.md) | — | Jyotirmay Singh Mahato | BJP | ⚠ 3 | [open →](https://kaun.city/india/c/19-35) |
| `19-36` | [Bankura](19-36-bankura.md) | — | Arup Chakraborty | AITC | none declared | [open →](https://kaun.city/india/c/19-36) |
| `19-37` | [Bishnupur](19-37-bishnupur.md) | SC | Saumitra Khan | BJP | ⚠ 15 | [open →](https://kaun.city/india/c/19-37) |
| `19-38` | [Bardhaman Purba](19-38-bardhaman-purba.md) | SC | Sharmila Sarkar | AITC | none declared | [open →](https://kaun.city/india/c/19-38) |
| `19-39` | [Bardhaman-Durgapur](19-39-bardhaman-durgapur.md) | — | Azad Kirti Jha | AITC | ⚠ 1 | [open →](https://kaun.city/india/c/19-39) |
| `19-40` | [Asansol](19-40-asansol.md) | — | Shatrughan Prasad Sinha | AITC | none declared | [open →](https://kaun.city/india/c/19-40) |
| `19-41` | [Bolpur](19-41-bolpur.md) | SC | Asit Kumar Mal | AITC | none declared | [open →](https://kaun.city/india/c/19-41) |
| `19-42` | [Birbhum](19-42-birbhum.md) | — | Satabdi Roy | AITC | none declared | [open →](https://kaun.city/india/c/19-42) |

---

## Reading the columns

- **Reserved** — SC or ST as fixed by the Delimitation Order in force. A dash means the seat is
  General. Kaun takes this from the order's own schedule, because every boundary file and roster
  API checked under-reports it — DataMeet's own PC file and the official Lok Sabha members API
  both undercount ST seats.
- **Declared cases** — pending criminal cases the winner declared in their Election Commission
  nomination affidavit. Self-declared; a pending case is an accusation, not a conviction.
  "Pending review" means Kaun holds no publicly-cleared affidavit for that seat.
- **Sitting MP** — from the sansad.in roster. Ministers are marked, because their parliamentary
  activity metrics are structurally absent rather than low.

## Sources

| Dataset | Publisher | Notes |
|---|---|---|
| Seat identity and boundaries (543) | [DataMeet + shijithpk 2024 supplement](https://github.com/datameet/maps/tree/master/parliamentary-constituencies) | 2008 delimitation, with the 2022 J&K and 2023 Assam orders applied. Assam, J&K and Ladakh outlines were re-georeferenced from ECI press-note PDFs and are not survey-grade. |
| Assembly segments and districts (crosswalk `2008do+2023as+2022jk-2026.07`) | [Kaun, from ECI Delimitation Orders 2008 / 2022-J&K / 2023-Assam](../pc-crosswalk.md) | Table B of the order in force for each state, parsed and then independently verified against AC/PC/district polygons. |
| MP roster — 18th Lok Sabha | [sansad.in (Lok Sabha Secretariat)](https://sansad.in) | sansad.in publishes constituency names with no seat number. Names resolve to a `pc_code` through an alias table and exact normalized matching only — never by similarity. |
| Criminal cases, assets, education | [ECI nomination affidavits via myneta.info (ADR)](https://myneta.info) | Self-declared by the candidate. Kaun reproduces the declaration; it does not verify it. |

