export const demo = {
 name:'예제 설비 · 컨베이어',
 devices:[{address:'P000',comment:'기동 버튼'},{address:'P001',comment:'안전 조건 정상'},{address:'M100',comment:'운전 허가'},{address:'P002',comment:'배출부 만재'},{address:'P020',comment:'컨베이어 출력'},{address:'M250',comment:'다음 공정 허가'},{address:'P003',comment:'정지 버튼'}],
 rungs:[
  {id:'r1',program:'운전 조건',location:'스텝 10',reads:['P000','P001'],writes:[{address:'M100',instruction:'SET'}],note:'기동 버튼과 안전 조건'},
  {id:'r2',program:'운전 조건',location:'스텝 25',reads:['P003'],writes:[{address:'M100',instruction:'RST'}],note:'정지 버튼'},
  {id:'r3',program:'컨베이어',location:'스텝 38',reads:['M100','P002'],writes:[{address:'P020',instruction:'OUT'}],note:'만재 조건은 원본 래더에서 확인'},
  {id:'r4',program:'다음 공정',location:'스텝 12',reads:['M100'],writes:[{address:'M250',instruction:'OUT'}],note:'공정 간 운전 허가'}
 ]
};
