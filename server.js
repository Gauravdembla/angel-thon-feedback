import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';

// env vars
dotenv.config();
const SHEET_ID = process.env.SHEET_ID;
const PORT     = process.env.PORT || 8080;

// Google Sheets auth
const creds = JSON.parse(fs.readFileSync('service-account.json','utf8'));
const auth  = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  credentials: creds,
});
const sheets = google.sheets({ version: 'v4', auth });

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// helper to read a range
async function read(range){
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return data.values || [];
}

/* === API === */

// lookup route
app.get('/api/lookup', async (req,res)=>{
  try{
    const email=(req.query.email||'').trim().toLowerCase();
    const day =(await read('Day Label!B2'))[0][0].trim();

    const dup = await read('Submission Log!B:C');
    if(dup.some(r=> (r[0]||'').toLowerCase()===email && r[1]===day))
      return res.json({status:'duplicate'});

    const pRows=await read('Participants Task Completion Points!A:E');
    const row  = pRows.find(r=> (r[3]||'').toLowerCase()===email);
    if(!row) return res.json({status:'not_found'});
    const [fanID,name,mobile,,team]=row;

    const fRows=await read('Angel-Thon 7.0 Facilitators!A:E');
    const facs=fRows.filter(r=> (r[4]||'').toLowerCase()===team.toLowerCase()).slice(0,3).map(r=>r[1]);
    if(facs.length<3) return res.json({status:'no_fac'});

    res.json({status:'ok',email,fanID,name,mobile,team,day,facilitators:facs});
  }catch(e){console.error(e);res.status(500).json({status:'error'});}
});

// feedback route
app.post('/api/feedback', async (req,res)=>{
  try{
    const {email,fanID,name,mobile,team,day,scores}=req.body;
    const time=new Date().toISOString();
    const rows=scores.map(o=>[time,email,fanID,name,mobile,team,o.fac,...o.vals]);
    const append={spreadsheetId:SHEET_ID,valueInputOption:'USER_ENTERED',requestBody:{values:rows}};

    await sheets.spreadsheets.values.append({...append,range:'Facilitator Feedback Responses!A1'});
    await sheets.spreadsheets.values.append({...append,range:'Angel-Thon 7.0 Facilitators ( Feedback From )!A1'});
    await sheets.spreadsheets.values.append({
      spreadsheetId:SHEET_ID,range:'Submission Log!A1',valueInputOption:'USER_ENTERED',
      requestBody:{values:[[time,email,day]]}
    });
    res.json({status:'saved'});
  }catch(e){console.error(e);res.status(500).json({status:'error'});}
});

// start
app.listen(PORT, ()=>console.log('Server on '+PORT));
