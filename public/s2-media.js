// Delivery data only. Replace the versioned URL and checksum together when corrected media arrives.
export const secondScene={
 id:'s2-b-9e05b035',video:'assets/NZ2_S2B_9e05b035.mp4',duration:137.927007,
 sha256:'9e05b0355bd611380996b233479c5cf664b2a8826e84a985f2d435211955d834',
 audioMode:'mixed-narration',contentApproved:true,
 review:{status:'corrected',windows:[[42,44],[63,65],[85,93]],scope:'supplied corrected delivery; selected windows confirmed by content owner'},
 backup:{id:'s2-a-7b8b4703',video:'assets/NZ2_S2A_7b8b4703.mp4',duration:137.927007,sha256:'7b8b4703fb7a98d8ba695c8cf2cb9ab92821cc2ed53043198068fae2ae0de4fd'},
 revised:null,
 scene:{id:'scene-s2',title:'山间练习',storyNumber:2,start:0,end:137.927007,characterIds:['C01','C02']},
 cover:{file:'nz2-s2-cover-v1.jpg',alt:'群山云雾间的岩石平台，哪吒与太乙真人站在远处'},
 cues:[
  {start:6.683333,end:9.583333,text:'哪吒松散地站稳，突然冲向太乙。'},
  {start:30.3,end:37.733333,text:'太乙用拂尘把哪吒卷起，像陀螺般甩出。哪吒滚到泥塘边，抓住树枝，差点掉下去。'},
  {start:42.166667,end:44.266667,text:'太乙也滑倒坐入泥里。'},
  {start:63.283333,end:65.366667,text:'太乙低下头点点手指。'},
  {start:85.916667,end:87.45,text:'哪吒趴倒在地。'},
  {start:87.983333,end:89.65,text:'随后慢慢起身。'},
  {start:90.516667,end:92.15,text:'双眼变成蓝色。'},
  {start:116.05,end:121.75,text:'太乙与敖丙打得石头树枝遍地飞，最终太乙被打飞，踉跄落地。'},
 ].map(c=>({...c,maxDuration:c.end-c.start,kind:'narration'})),
};
