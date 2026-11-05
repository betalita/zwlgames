// Compact transcription of the official full-game tables observed 2026-11-05.
// https://www.fswbucs.com/sports/mbkb/2026-27/boxscores/20261104_pe7l.xml
const labels=['Player','MIN','FGM-A','3PM-A','FTM-A','OREB','DREB','REB','AST','STL','BLK','TO','PF','PTS'];
const school=[
 ['STARTERS'],['0 Weilun Zhao','39','6-20','2-8','8-9','0','3','3','0','0','0','2','5','22'],
 ['4 Devin Toatley','22','2-7','1-2','0-0','0','4','4','2','0','0','0','3','5'],
 ['5 Hashim Abukar','6','0-0','0-0','0-0','0','0','0','0','1','0','0','0','0'],
 ['21 Moussa Bamba','21','4-10','0-0','2-2','3','2','5','1','0','0','4','5','10'],
 ["24 Mbaye N'diaye",'35','8-12','1-2','6-7','1','4','5','2','3','1','2','2','23'],
 ['RESERVES'],['1 Isaiah Newson','10','0-1','0-1','0-0','0','2','2','1','0','0','0','5','0'],
 ['3 Shameek Casillas','14','1-1','1-1','0-0','0','2','2','0','0','0','1','3','3'],
 ['10 Enzo Mbaho','5','0-1','0-1','0-0','0','0','0','0','0','0','0','2','0'],
 ['11 Ade Daramola','14','2-5','0-1','0-0','0','0','0','0','2','0','0','2','4'],
 ['13 Karlis Vallis','7','2-3','0-1','0-0','0','0','0','0','0','0','0','2','4'],
 ['15 Georgio Tsipourlianos','12','2-3','0-1','2-2','1','0','1','0','0','0','0','3','6'],
 ['22 Sean Gomez','6','2-2','1-1','0-0','2','0','2','0','1','0','1','3','5'],
 ['25 Marcus Thomas','8','1-2','1-1','0-0','1','0','1','0','0','0','0','1','3'],
 ['TM TEAM','','','','','0','0','0','','','','0','0',''],
 ['TOTALS','','30-67','7-20','18-20','8','17','25','6','7','1','10','36','85']];
const opponent=[['STARTERS'],
 ['00 Johnson, Kyler','32','2-4','0-0','2-2','0','3','3','1','1','0','0','2','6'],
 ['3 Cotto, Josiah','31','5-8','4-5','17-17','0','7','7','3','1','0','3','2','31'],
 ['10 Laguarrue, Albert','20','3-7','1-1','2-2','3','3','6','1','0','0','0','2','9'],
 ['11 Jones, Myles','30','8-13','1-3','8-11','0','4','4','0','2','0','3','5','25'],
 ['14 Perkins, Montravious','16','0-1','0-0','0-0','0','1','1','1','1','0','1','3','0'],
 ['RESERVES'],['0 Jones, King','1','1-1','0-0','0-0','0','1','1','0','0','0','0','0','2'],
 ['1 George, Miles','20','2-5','1-4','10-13','0','1','1','1','1','0','0','1','15'],
 ['2 Smith, Jaqari','10','2-4','0-2','0-0','0','2','2','0','0','0','0','2','4'],
 ['4 Beckman, Jayden','1','0-0','0-0','0-0','0','0','0','0','0','0','0','0','0'],
 ['6 Canty, Deshawn','17','0-1','0-0','0-2','2','3','5','0','0','2','0','0','0'],
 ['8 Jones, Treymar','9','1-2','1-1','2-2','1','1','2','1','0','0','0','0','5'],
 ['13 Johnson, Terrell','1','0-0','0-0','2-2','0','0','0','0','1','0','1','0','2'],
 ['21 Collier, Christian','11','0-0','0-0','4-4','0','0','0','0','0','0','0','1','4'],
 ['TM TEAM','','','','','0','0','0','','','','0','0',''],
 ['TOTALS','','24-46','8-16','47-55','6','26','32','8','7','2','8','18','103']];
const teamRows=[['Stat','Albany Technical College','Florida SouthWestern State College'],
 ['Field Goal','24-46','30-67'],['Field Goal %','52.2%','44.8%'],['3 Point','8-16','7-20'],['3 Point %','50.0%','35.0%'],['Free Throw','47-55','18-20'],['Free Throw %','85.5%','90.0%'],['Rebounds','32','25'],['Assists','8','6'],['Turnovers','8','10'],['Points off Turnovers','11','11'],['2nd Chance Points','7','21'],['Points in the Paint','28','34'],['Fastbreak Points','17','20'],['Bench Points','32','25'],['Largest Lead','23','3']];
const table=(caption,rows)=>'<table><caption><h2>'+caption+'</h2></caption>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</table>';
const heading='<h1>Albany Technical College at Florida SouthWestern State College November 4, 2026</h1>';
const html=()=>heading+table('Albany Technical College',[labels,...opponent])+table('Florida SouthWestern State College',[labels,...school]);
module.exports={labels,school,opponent,teamRows,table,heading,html,teamHtml:()=>heading+table('Team Statistics',teamRows)};
