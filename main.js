const {Plugin,ItemView,Setting}=require('obsidian');
const VIEW='exam-local-links-view';
function localRelations(graph,center){const rows=new Map();for(const [target,count]of Object.entries(graph[center]||{})){if(target!==center)rows.set(target,{path:target,out:Number(count)||0,in:0});}for(const [source,targets]of Object.entries(graph)){if(source===center||!targets[center])continue;const row=rows.get(source)||{path:source,out:0,in:0};row.in=Number(targets[center])||0;rows.set(source,row);}return [...rows.values()];}
function incomingCounts(graph){const counts=new Map();for(const targets of Object.values(graph))for(const [target,count]of Object.entries(targets))counts.set(target,(counts.get(target)||0)+(Number(count)||0));return counts;}
class LinkView extends ItemView{
  constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.center='';this.direction='all';this.query='';this.order='references';this.limit=30;this.locked=false;}
  getViewType(){return VIEW;}getDisplayText(){return '局部关联';}getIcon(){return 'network';}
  onOpen(){this.center=this.app.workspace.getActiveFile()?.path||'';this.render();}
  render(){const el=this.contentEl;el.empty();el.addClass('local-links');el.createEl('h2',{text:'局部关联'});el.createEl('p',{text:'引用量表示链接次数，人工星级读取 importance，两者均不代表考试概率。',cls:'links-muted'});
    new Setting(el).setName('中心笔记').setDesc(this.center||'请先打开一篇笔记').addButton(b=>b.setButtonText('使用当前笔记').onClick(()=>{this.center=this.app.workspace.getActiveFile()?.path||this.center;this.draw();})).addToggle(t=>t.setValue(this.locked).onChange(v=>this.locked=v));
    new Setting(el).setName('关系与排序').addDropdown(d=>d.addOptions({all:'入链与出链',in:'仅入链',out:'仅出链'}).setValue(this.direction).onChange(v=>{this.direction=v;this.draw();})).addDropdown(d=>d.addOptions({references:'全库引用量',importance:'人工星级',name:'名称'}).setValue(this.order).onChange(v=>{this.order=v;this.draw();}));
    new Setting(el).setName('名称或路径筛选').addSearch(s=>s.setValue(this.query).onChange(v=>{this.query=v;this.draw();}));
    this.body=el.createDiv();this.draw();
  }
  draw(){if(!this.body)return;this.body.empty();this.body.createEl('strong',{text:this.center||'没有中心笔记'});if(!this.center)return;const graph=this.app.metadataCache.resolvedLinks||{};const counts=incomingCounts(graph);const rows=localRelations(graph,this.center).filter(r=>(this.direction==='all'||r[this.direction]>0)&&r.path.toLowerCase().includes(this.query.toLowerCase())).map(r=>{const file=this.app.vault.getAbstractFileByPath(r.path);const importance=Number(this.app.metadataCache.getFileCache(file)?.frontmatter?.importance);return {...r,file,references:counts.get(r.path)||0,importance:Number.isFinite(importance)?Math.max(0,Math.min(5,importance)):null};});rows.sort((a,b)=>this.order==='name'?a.path.localeCompare(b.path,'zh-CN'):this.order==='importance'?(b.importance??-1)-(a.importance??-1)||a.path.localeCompare(b.path):(b.references-a.references)||a.path.localeCompare(b.path));const shown=rows.slice(0,this.limit);this.body.createEl('p',{text:`关联 ${rows.length} 篇 · 图中最多显示 ${this.limit} 篇 · 不含尚未解析的链接`,cls:'links-muted'});
    if(!shown.length){this.body.createEl('p',{text:'暂无符合筛选的已解析关联。'});return;}
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 480');svg.setAttribute('role','img');svg.setAttribute('aria-label','中心笔记及相邻笔记的局部关系示意');this.body.appendChild(svg);
    const add=(tag,attrs,text)=>{const n=document.createElementNS(svg.namespaceURI,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text)n.textContent=text;svg.appendChild(n);return n;};
    shown.forEach((row,i)=>{const angle=i*2*Math.PI/shown.length;const x=300+220*Math.cos(angle),y=240+185*Math.sin(angle);add('line',{x1:300,y1:240,x2:x,y2:y,class:'links-edge'});const circle=add('circle',{cx:x,cy:y,r:9,class:'links-node'});circle.addEventListener('click',()=>this.focus(row.path));add('text',{x,y:y-14,'text-anchor':'middle',class:'links-label'},(row.file?.basename||row.path).slice(0,12));});add('circle',{cx:300,cy:240,r:14,class:'links-center'});add('text',{x:300,y:270,'text-anchor':'middle',class:'links-label'},(this.center.split('/').pop()||'').slice(0,22));
    for(const row of rows){const line=this.body.createDiv({cls:'links-row'});const open=line.createEl('button',{text:row.file?.basename||row.path});open.onclick=()=>this.app.workspace.openLinkText(row.path,'','tab');const focus=line.createEl('button',{text:'聚焦'});focus.onclick=()=>this.focus(row.path);line.createSpan({text:`入链 ${row.in} · 出链 ${row.out} · 全库被引 ${row.references} · 人工星级 ${row.importance??'未设置'}`,cls:'links-muted'});}
  }
  focus(path){this.center=path;this.locked=true;this.render();}
}
class Links extends Plugin{
  async onload(){this.registerView(VIEW,l=>new LinkView(l,this));this.addRibbonIcon('network','局部关联',()=>this.open());this.addCommand({id:'open',name:'查看当前笔记局部关联',callback:()=>this.open()});this.registerEvent(this.app.workspace.on('file-open',file=>{if(!file)return;for(const leaf of this.app.workspace.getLeavesOfType(VIEW)){const v=leaf.view;if(!v.locked){v.center=file.path;v.render();}}}));this.registerEvent(this.app.metadataCache.on('resolved',()=>{for(const leaf of this.app.workspace.getLeavesOfType(VIEW))leaf.view.draw();}));}
  async open(){let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}this.app.workspace.revealLeaf(leaf);}
  onunload(){this.app.workspace.detachLeavesOfType(VIEW);}
}
module.exports=Links;module.exports.__test={localRelations,incomingCounts};
