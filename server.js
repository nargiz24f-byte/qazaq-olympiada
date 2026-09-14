
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || "teacher";
const DB_FILE = process.env.SUBMISSIONS_FILE || path.join(__dirname, "submissions.json");

function readSubs(){
  try{
    if(!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf8");
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8") || "[]");
  }catch(e){ return []; }
}
function writeSubs(rows){
  fs.writeFileSync(DB_FILE, JSON.stringify(rows, null, 2), "utf8");
}

app.post("/api/teacher-login", (req,res)=>{
  const p = String(req.body?.password || "");
  if(p === TEACHER_PASSWORD) return res.json({ok:true});
  res.status(401).json({error:"Құпиясөз қате"});
});

app.get("/api/submissions", (req,res)=>{
  res.json(readSubs());
});
let dayAccess = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false
};
app.get("/api/day-access", (req, res) => {
  res.json(dayAccess);
});
app.post("/api/day-access", (req, res) => {
  const password = String(req.body?.password || "");
  const day = String(req.body?.day || "");
  const open = req.body?.open === true;

  if (password !== TEACHER_PASSWORD) {
    return res.status(401).json({ error: "Құпиясөз қате" });
  }

  if (!(day in dayAccess)) {
    return res.status(400).json({ error: "Күн дұрыс таңдалмаған" });
  }

  dayAccess[day] = open;
  res.json({ ok: true, dayAccess });
});





app.post("/api/submissions", (req,res)=>{
  const sub=req.body || {};
  if(!sub.name || !sub.day) return res.status(400).json({error:"Толық емес дерек"});
  const rows=readSubs();
  const idx=rows.findIndex(x=>x.name===sub.name && x.week===sub.week && x.day===sub.day);
  if(idx>=0) rows[idx]=sub; else rows.push(sub);
  writeSubs(rows);
  res.json({ok:true});
});

app.post("/api/literature-feedback", async (req,res)=>{
  try{
    if(!GROQ_API_KEY){
      return res.status(503).json({error:"GROQ_API_KEY орнатылмаған"});
    }
    const {grade,week,day,work,answers}=req.body||{};
    const system = `Сен 9-сынып қазақ әдебиеті бойынша олимпиада дайындығына көмектесетін мұғалімсің.
Оқушының шығарманы талдау жұмысын өте әділ бағала.
Дайын талдауды оқушы орнына жазба.
1-10 аралығында баға қой.
Бағалау өлшемдері: мазмұн дәлдігі, тақырып пен идеяны ажырату, жанрды түсіндіру, композиция, образдар жүйесі, көркемдік тәсілдер, тарихи-әлеуметтік контекст, дәлел, тіл сауаттылығы, қорытынды.
Қате немесе үстірт тұстарын нақты ата.
Кері байланыс қысқа, түсінікті және түзетуге бағытталған болсын.
Тек JSON қайтар:
{"score":1-10,"strengths":["..."],"errors":["..."],"advice":["..."]}`;
    const user = `Сынып: ${grade}
Апта: ${week}
Күн: ${day}
Шығарма: ${work}
Оқушы жауаптары:
${JSON.stringify(answers, null, 2)}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:"POST",
      headers:{
        "Authorization":`Bearer ${GROQ_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:"openai/gpt-oss-20b",
        messages:[
          {role:"system",content:system},
          {role:"user",content:user}
        ],
        temperature:0.2,
        response_format:{type:"json_object"}
      })
    });
    const data=await response.json();
    if(!response.ok) return res.status(response.status).json({error:"ЖИ бағалау қатесі"});
    const txt=data.choices?.[0]?.message?.content || "{}";
    let parsed={};
    try{ parsed=JSON.parse(txt); }catch(e){}
    parsed.score=Math.max(1,Math.min(10,Number(parsed.score)||1));
    parsed.strengths=Array.isArray(parsed.strengths)?parsed.strengths:[];
    parsed.errors=Array.isArray(parsed.errors)?parsed.errors:[];
    parsed.advice=Array.isArray(parsed.advice)?parsed.advice:[];
    res.json(parsed);
  }catch(err){
    console.error(err);
    res.status(500).json({error:"Сервер қатесі"});
  }
});

app.get("*", (req,res)=>{
  res.sendFile(path.join(__dirname,"index.html"));
});

app.listen(PORT, ()=>console.log(`Qazaq Olimpiada running on ${PORT}`));
