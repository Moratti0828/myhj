<template>
  <section class="legacy-detail-page">
    <header class="legacy-detail-header">
      <RouterLink class="legacy-back-btn" to="/heritage">
        <span class="legacy-back-icon">←</span>
        返回
      </RouterLink>
      <div class="legacy-detail-logo">
        <img class="legacy-detail-logo-img" :src="'/image/logo.png'" alt="墨韵画境" />
        墨韵画境 · 非遗百科
      </div>
    </header>

    <main class="legacy-detail-main">
      <div class="legacy-detail-hero reveal in">
        <img class="legacy-hero-icon-img" :src="detail.icon" :alt="detail.title" />
        <h1>{{ detail.title }}</h1>
        <p class="legacy-subtitle">{{ detail.subtitle }}</p>
      </div>

      <nav class="heritage-reading-nav" aria-label="本页目录">
        <a href="#heritage-knowledge">百科全解</a>
        <a href="#heritage-reading">文化解读</a>
        <a href="#heritage-artworks">图片欣赏</a>
        <a href="#heritage-practice">创作练习</a>
      </nav>
      <HeritageKnowledge :key="String(route.params.type)" :topic="aliases[String(route.params.type)] || String(route.params.type)" />
      <div id="heritage-reading" class="legacy-timeline">
        <article v-for="item in detail.timeline" :key="item.title" class="legacy-timeline-item reveal in">
          <h3>{{ item.title }}</h3>
          <p v-for="paragraph in item.content" :key="paragraph">{{ paragraph }}</p>
        </article>
      </div>

      <section id="heritage-artworks" class="legacy-gallery-section reveal in">
        <h2>{{ detail.title }}艺术品鉴</h2>
        <HeritageArtworks :artworks="detail.artworks" :topic="aliases[String(route.params.type)] || String(route.params.type)" />
      </section>
      <section id="heritage-practice" class="heritage-practice">
        <span class="heritage-practice-kicker">从欣赏到创作</span>
        <h2>把{{ detail.title }}的灵感带进画布</h2>
        <p>先从上方图片中选一个元素，观察它的线条、配色与留白，再尝试画出自己的草图。</p>
        <label for="heritage-draft">创作描述（可以修改）</label>
        <textarea id="heritage-draft" v-model="draftPrompt" rows="4"></textarea>
        <p class="heritage-practice-note">选好风格，导入参考图或手写作品，让笔下灵感延展成画。</p>
        <button type="button" :disabled="creation.isBusy" @click="startPractice">{{ creation.isBusy ? '当前作品生成中，请稍候' : '带着描述去创作' }}</button>
      </section>
    </main>

    <footer class="legacy-detail-footer">
      <p>墨韵画境 · 让AI传承千年文化</p>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import HeritageKnowledge from '@/components/HeritageKnowledge.vue'
import HeritageArtworks from '@/components/HeritageArtworks.vue'
import { useRoute, useRouter } from 'vue-router'
import { useCreationStore } from '@/stores/creation'

interface DetailItem {
  title: string
  content: string[]
}

interface ArtworkItem {
  img: string
  label: string
}

interface HeritageDetail {
  title: string
  subtitle: string
  icon: string
  timeline: DetailItem[]
  artworks: ArtworkItem[]
}

const route = useRoute()

const details: Record<string, HeritageDetail> = {
  calligraphy: {
    title: '中国书法',
    subtitle: '汉字书写的生命律动',
    icon: '/image/icons/calligraphy.png',
    timeline: [
      {
        title: '三千年字形演变：从甲骨到狂草',
        content: [
          '中国书法是以汉字为载体的独特线条艺术，其演变历程是一部中华审美精神史。甲骨文瘦硬挺拔，金文浑厚庄严，小篆建立秩序，隶书展开波磔，楷书确立法度，行草则释放书写中的速度、气息与情感。',
          '书法并不只是“写得好看”，它把时间、力道、呼吸和人格都压进线条里。一个转折、一处留白、一片枯润，都是书写者与纸墨之间的即时对话。',
        ],
      },
      {
        title: '“骨”与“肉”的性灵碰撞',
        content: [
          '书法审美讲究骨肉相称。颜真卿的字浑厚雄强，如筋腱饱满；柳公权的字清峻挺拔，如骨节峭立。所谓“颜筋柳骨”，正是线条内部张力与人格气象的凝结。',
          '古人论书，以“无骨”为“墨猪”，以“无肉”为“枯骨”。好的书作既有骨架支撑，又有墨肉温润，最终达到精、气、神的统一。',
        ],
      },
      {
        title: '天下第一行书的二十个“之”字',
        content: [
          '公元353年暮春，王羲之在兰亭雅集后写下《兰亭序》，被后世奉为“天下第一行书”。全篇二十个“之”字无一雷同，有的藏锋内敛，有的舒展恣肆，有的如飞鸟投林，有的如惊蛇入草。',
          '《兰亭序》的魅力在于天然去雕饰。它不是反复经营出的完美，而是春光、美酒、雅集、胸襟与笔墨在瞬间共振后的不可复制。',
        ],
      },
      {
        title: '文房四宝的物性哲学',
        content: [
          '笔、墨、纸、砚不仅是工具，更是书法家与自然对话的媒介。湖笔讲究万毫齐力，徽墨能分干湿浓淡焦，宣纸以吸水与晕染考验行笔速度，端砚、歙砚则沉稳如山。',
          '书法的高级处，不在工具之外，而在书写者懂得顺应工具的性格：借水墨流动而不失控，借纸性渗化而不散乱。',
        ],
      },
    ],
    artworks: [
      { img: '/image/中国书法/兰亭序.png', label: '王羲之《兰亭序》' },
      { img: '/image/中国书法/颜真卿楷书.png', label: '颜真卿楷书' },
      { img: '/image/中国书法/怀素草书.png', label: '怀素草书' },
      { img: '/image/中国书法/米芾行书.png', label: '米芾行书' },
      { img: '/image/中国书法/汉代隶书.png', label: '汉代隶书' },
      { img: '/image/中国书法/魏碑书法.png', label: '魏碑书法' },
    ],
  },
  ink: {
    title: '中国画',
    subtitle: '尺幅之内的万千气象',
    icon: '/image/icons/painting.png',
    timeline: [
      {
        title: '工笔的“三矾九染”与写意的“墨分五色”',
        content: [
          '中国画主要分为工笔与写意。工笔追求精致细腻，以层层渲染、反复罩染形成沉稳而透明的色彩；写意则重神似不重形似，以水墨的浓淡干湿表达胸中丘壑。',
          '所谓“墨分五色”，是画家通过水分、墨量和行笔速度，在黑白之间生成空间、光影、质地与气韵。',
        ],
      },
      {
        title: '散点透视：打破时空的自由美学',
        content: [
          '中国画不受单一焦点限制，常以“散点透视”组织画面。山川、村落、桥亭、云水可以在一幅长卷中随观看节奏展开，观者仿佛步入画中。',
          '这种透视不是技术上的不严谨，而是审美上的主动选择：画家要表现的不是眼前一瞬，而是人在天地之间游观、迁移和沉思的过程。',
        ],
      },
      {
        title: '青绿山水与文人水墨的双峰',
        content: [
          '《千里江山图》代表青绿山水的辉煌，以石青、石绿等矿物颜料构成盛世山河；《富春山居图》代表文人水墨的高峰，以淡墨皴擦写出富春江的清旷气息。',
          '前者璀璨宏大，后者萧散空灵，二者共同说明：中国画既能承载帝国气象，也能安放个人心境。',
        ],
      },
      {
        title: '山水、花鸟、人物的精神寄托',
        content: [
          '山水画寄托澄怀观道，花鸟画借物抒情，人物画讲究传神写照。梅兰竹菊、松石云水、仕女高士，都不是简单题材，而是人格、理想与情感的象征。',
          '画家借自然物象表达品格与情志，使一枝一石也能寄托心境。',
        ],
      },
    ],
    artworks: [
      { img: '/image/中国画/山水画.png', label: '山水画' },
      { img: '/image/中国画/人物画.png', label: '人物画' },
      { img: '/image/中国画/花鸟画.png', label: '花鸟画' },
      { img: '/image/中国画/竹石图.png', label: '竹石图' },
      { img: '/image/中国画/莲花图.png', label: '莲花图' },
      { img: '/image/中国画/鸟雀图.png', label: '鸟雀图' },
    ],
  },
  embroidery: {
    title: '中国刺绣',
    subtitle: '针尖上的中国微雕',
    icon: '/image/icons/embroidery.png',
    timeline: [
      {
        title: '四大名绣的地域美学',
        content: [
          '中国刺绣在漫长发展中形成苏、湘、蜀、粤四大名绣。苏绣细密雅致，湘绣生动豪放，蜀绣光润严谨，粤绣华丽立体。',
          '不同地域的水土、民俗和审美造就了不同针法，也让刺绣成为可穿戴、可陈设、可传情的东方工艺。',
        ],
      },
      {
        title: '双面绣的空间魔法',
        content: [
          '双面绣在同一底料的两面呈现绣面。普通双面绣与双面异色、异样等形式存在区别，不能将所有双面绣都理解为两面图案不同。起针和落针都要藏于针脚之间，不能露出线头。',
          '这类作品考验的不只是手艺，更是耐心、呼吸和对材料的精微控制。',
        ],
      },
      {
        title: '劈丝至微：蚕丝的分线哲学',
        content: [
          '高档刺绣常要将一根蚕丝线劈成更细的丝缕，用极细线条表现眼神、毛发、花瓣边缘和光泽变化。',
          '当数百上千层微细丝线交织，刺绣便获得了绘画难以替代的柔和反光与触觉质感。',
        ],
      },
      {
        title: '从服饰礼仪到当代时尚',
        content: [
          '刺绣曾用于龙袍、官服补子、嫁衣、香囊、虎头鞋，也进入今天的高定礼服、家居挂屏和文创设计。',
          '它既是博物馆中的工艺遗产，也是仍在生活中延展的审美语言。',
        ],
      },
    ],
    artworks: [
      { img: '/image/中国刺绣/苏绣双面绣.png', label: '苏绣双面绣' },
      { img: '/image/中国刺绣/湘绣狮虎图.png', label: '湘绣狮虎' },
      { img: '/image/中国刺绣/蜀绣熊猫.png', label: '蜀绣熊猫' },
      { img: '/image/中国刺绣/粤绣龙凤.png', label: '粤绣龙凤' },
      { img: '/image/中国刺绣/花卉刺绣.png', label: '花卉刺绣' },
      { img: '/image/中国刺绣/孔雀刺绣.png', label: '孔雀刺绣' },
    ],
  },
  papercut: {
    title: '中国剪纸',
    subtitle: '镂空艺术的阴阳之美',
    icon: '/image/icons/papercutting.png',
    timeline: [
      {
        title: '剪刻之间的阴阳调和',
        content: [
          '剪纸以纸张为媒介，通过剪刀或刻刀生成虚实关系。阳刻保留线条，阴刻保留块面，二者相互配合，在单色红纸中产生强烈层次。',
          '一张纸被剪开的部分是空，留下的部分是实，空实相生正是剪纸最核心的美学。',
        ],
      },
      {
        title: '北方粗犷与南方纤柔',
        content: [
          '北方剪纸多见于窗花、炕围花，造型夸张质朴，保留图腾感和泥土气息；南方剪纸更精致纤秀，常与金箔、彩绘和装饰图案结合。',
          '粗犷与细腻并存，使剪纸既有民间生命力，也有高度装饰性。',
        ],
      },
      {
        title: '岁时节令中的红色祝福',
        content: [
          '春节贴窗花、婚嫁贴喜花、节庆剪福禄寿喜，剪纸一直与民俗生活紧密相连。',
          '“连年有余”“龙凤呈祥”“五谷丰登”等图案，将普通人的愿望化作可触摸的红色符号。',
        ],
      },
      {
        title: '世界非遗与现代视觉重构',
        content: [
          '中国剪纸于2009年入选联合国教科文组织人类非物质文化遗产代表作名录。',
          '今天，剪纸语言被用于动画、舞台、美术设计、包装和时装，让古老民艺进入现代视觉系统。',
        ],
      },
    ],
    artworks: [
      { img: '/image/剪纸/花鸟窗花.png', label: '花鸟窗花' },
      { img: '/image/剪纸/牡丹剪纸.png', label: '牡丹剪纸' },
      { img: '/image/剪纸/莲花锦鲤.png', label: '莲花锦鲤' },
      { img: '/image/剪纸/龙凤呈祥.png', label: '龙凤呈祥' },
      { img: '/image/剪纸/福字剪纸.png', label: '福字剪纸' },
      { img: '/image/剪纸/福禄寿喜.png', label: '福禄寿喜' },
    ],
  },
  ceramics: {
    title: '中国陶瓷',
    subtitle: '泥与火的淬炼之美',
    icon: '/image/icons/ceramics.png',
    timeline: [
      {
        title: '土、釉、火的三重塑形',
        content: [
          '陶瓷之美来自泥土成型、釉色覆盖与窑火烧成的共同作用。每一次温度变化、气氛变化和釉料流动，都会在器物表面留下不可完全复制的痕迹。',
          '这也是陶瓷迷人的地方：它既需要极严格的工艺控制，也保留了火焰带来的偶然性。',
        ],
      },
      {
        title: '青花、粉彩与颜色釉',
        content: [
          '青花以钴料在白瓷上绘纹，清雅含蓄；粉彩柔和细腻，适合花鸟人物；颜色釉则以釉色本身作为主角，呈现天青、祭红、霁蓝、茶叶末等丰富变化。',
          '景德镇瓷器把绘画、造型、釉色和器用结合起来，成为中国工艺的世界名片。',
        ],
      },
      {
        title: '海上丝路中的“白色金子”',
        content: [
          '自唐宋以来，中国瓷器通过陆上与海上丝绸之路远销世界，被海外贵族视作珍宝。',
          '为适应海外市场，外销瓷还融合西方纹章、油画构图与中国青花五彩技艺，成为跨文化交流的器物证据。',
        ],
      },
      {
        title: '从日用器到当代艺术',
        content: [
          '陶瓷既可以是碗盏瓶罐等日用器，也可以成为雕塑、装置和当代设计材料。',
          '在现代语境中，传统釉色、器型和纹样仍然能与新的审美、空间和生活方式相互生长。',
        ],
      },
    ],
    artworks: [
      { img: '/image/中国陶瓷/青花瓷瓶.png', label: '青花瓷瓶' },
      { img: '/image/中国陶瓷/粉彩茶具.png', label: '粉彩茶具' },
      { img: '/image/中国陶瓷/单色釉碗.png', label: '单色釉碗' },
      { img: '/image/中国陶瓷/龙泉青瓷.png', label: '龙泉青瓷' },
      { img: '/image/中国陶瓷/紫砂壶图.png', label: '紫砂壶' },
      { img: '/image/中国陶瓷/建盏黑釉图.png', label: '建盏黑釉' },
    ],
  },
  lantern: {
    title: '中国花灯',
    subtitle: '点亮黑夜的东方光影',
    icon: '/image/icons/lantern.png',
    timeline: [
      {
        title: '宫灯的木构与彩绘',
        content: [
          '中国花灯不仅是照明工具，更融合木工、漆艺、彩绘、剪纸和编扎。宫灯常用榫卯结构搭出六角、八角等形制，并以绢纱、流苏和手绘图案装饰。',
          '灯光透过纱面后变得柔和温暖，形成一种既实用又华丽的空间艺术。',
        ],
      },
      {
        title: '走马灯的热力学奇迹',
        content: [
          '走马灯利用蜡烛产生的热空气推动叶轮旋转，带动剪纸人马图案投影在灯罩上。',
          '这种古老装置把光、热、空气流动和影像循环结合起来，是传统工艺中的科学想象。',
        ],
      },
      {
        title: '上元灯会与人间团圆',
        content: [
          '正月十五元宵节，花灯照亮街巷，也照亮诗词、爱情和家国记忆。猜灯谜、赏灯会、送灯祈福，都让花灯成为团圆与祝愿的符号。',
          '“东风夜放花千树”写的是节日场景，也是中国人关于光明、热闹和相逢的共同想象。',
        ],
      },
      {
        title: '现代灯彩的视觉再生',
        content: [
          '传统花灯制作技艺已进入非遗保护体系。今天的灯彩结合 LED、机械控制、投影与大型公共艺术，在城市节庆中创造新的视觉奇观。',
          '它不再只是挂在门前的一盏灯，也成为文化展示和城市记忆的一部分。',
        ],
      },
    ],
    artworks: [
      { img: '/image/花灯/传统花灯.png', label: '传统灯笼' },
      { img: '/image/花灯/走马灯.png', label: '走马灯' },
      { img: '/image/花灯/花灯璀璨.png', label: '花灯璀璨' },
      { img: '/image/花灯/龙花灯图.png', label: '龙灯' },
      { img: '/image/花灯/兔花灯图.png', label: '兔灯' },
      { img: '/image/花灯/宫廷花灯.png', label: '宫灯' },
    ],
  },
  knot: {
    title: '中国结',
    subtitle: '一根红绳的无限宇宙',
    icon: '/image/icons/knot.png',
    timeline: [
      {
        title: '一绳到底的拓扑艺术',
        content: [
          '中国结常以一根绳线贯穿始终，通过穿插、环套、抽紧形成复杂而对称的结构。',
          '每一个节点都要在受力上保持平衡，结才会端正、紧密、不松散。这是一种民间手艺，也是一种空间几何。',
        ],
      },
      {
        title: '盘长结、同心结与吉祥结',
        content: [
          '盘长结象征生生不息，同心结象征情感相守，吉祥结寓意福运连连。不同结型既有几何结构，也有文化语义。',
          '中国结的图案并非单纯装饰，而是把祝愿、契约和情感编织成可悬挂、可佩戴的形式。',
        ],
      },
      {
        title: '从结绳记事到节庆装饰',
        content: [
          '在文字产生之前，结绳曾承担记录和约定的功能。后来，结成为结合、结盟、结发、结果等观念的象征。',
          '春节、婚礼、乔迁与礼品中常见的中国结，承载着凝聚、守护与祝福。',
        ],
      },
      {
        title: '当代中国结的融合设计',
        content: [
          '当代设计把中国结与金属、玉石、皮革、丝绸结合，进入首饰、家居、服装和公共装置。',
          '它以一抹“中国红”保持辨识度，也在新的材料和场景中继续生长。',
        ],
      },
    ],
    artworks: [
      { img: '/image/中国结/盘长结.png', label: '盘长结' },
      { img: '/image/中国结/如意结.png', label: '如意结' },
      { img: '/image/中国结/同心结.png', label: '同心结' },
      { img: '/image/中国结/平安结.png', label: '平安结' },
      { img: '/image/中国结/团锦结.png', label: '团锦结' },
      { img: '/image/中国结/中国结.png', label: '中国结' },
    ],
  },
  mask: {
    title: '京剧脸谱',
    subtitle: '色彩演绎人生',
    icon: '/image/icons/mask.png',
    timeline: [
      {
        title: '五彩性格密码',
        content: [
          '京剧脸谱通过色彩、线条和纹样帮助塑造人物。人们常用红、黑、白等颜色作入门辨认，但具体含义仍需结合人物、剧目和表演传统理解。',
          '观众可以从脸谱获得角色线索，再结合唱念、身段与剧情理解人物，不能只凭一种颜色作判断。',
        ],
      },
      {
        title: '三块瓦与十字门的几何谱式',
        content: [
          '脸谱并非随意涂画，而有整脸、三块瓦、十字门等程式。艺人用黑线、白块和彩色区域重构面部结构，让表情在舞台距离中依然清晰有力。',
          '这种高度概括的视觉语言，是戏曲假定性美学的重要部分。',
        ],
      },
      {
        title: '离形取意的舞台美学',
        content: [
          '脸谱不追求生理写实，而追求精神本质。包拯的月牙、窦尔敦的眼角纹、神怪额头的火焰与祥云，都是从形象进入性格的符号。',
          '它让“未开言先有声”成为可能：人物还未唱念，视觉已经先行叙事。',
        ],
      },
      {
        title: '从戏台走向文创时尚',
        content: [
          '京剧入选人类非物质文化遗产代表作名录后，脸谱也成为极具辨识度的中国视觉名片。',
          '今天，脸谱被用于潮玩、包装、平面设计、服饰和国际文化交流，继续以强烈色彩讲述中国故事。',
        ],
      },
    ],
    artworks: [
      { img: '/image/脸谱/红脸关羽.png', label: '红脸关羽' },
      { img: '/image/脸谱/黑脸包丞.png', label: '黑脸包拯' },
      { img: '/image/脸谱/白脸曹操.png', label: '白脸曹操' },
      { img: '/image/脸谱/黄脸典韦.png', label: '黄脸典韦' },
      { img: '/image/脸谱/蓝脸窦尔顿.png', label: '蓝脸窦尔敦' },
      { img: '/image/脸谱/猴王脸谱.png', label: '猴王脸谱' },
    ],
  },
}

const aliases: Record<string, string> = {
  painting: 'ink',
  papercutting: 'papercut',
  papercut: 'papercut',
  pottery: 'ceramics',
  ceramic: 'ceramics',
  ceramics: 'ceramics',
}

const detail = computed(() => {
  const rawType = String(route.params.type || 'ink')
  const type = aliases[rawType] || rawType
  return details[type] || details.ink
})
const router = useRouter()
const creation = useCreationStore()
const draftPrompt = ref('')
watch(detail, value => {
  draftPrompt.value = `以${value.title}为灵感，选择一种传统视觉元素作为主体，突出线条与色彩的层次，构图简洁，保留适当留白。`
}, { immediate: true })
function startPractice() {
  creation.prompt = draftPrompt.value
  router.push('/creation')
}
</script>

<style scoped>
.heritage-reading-nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; margin: 24px 0 40px; }
.heritage-reading-nav a { padding: 10px 18px; border: 1px solid #c8c0ae; border-radius: 24px; background: #fffdf8; color: #45483f; text-decoration: none; }
#heritage-reading, #heritage-artworks, #heritage-practice { scroll-margin-top: 100px; }
.legacy-artwork { aspect-ratio: auto; cursor: default; }
.legacy-artwork::after { display: none; }
.legacy-artwork img { height: 240px; object-fit: contain; background: #f5f1e8; }
.heritage-artwork-caption { margin: 0; padding: 14px; color: #292c26; text-align: center; }
.heritage-practice { margin-top: 48px; padding: clamp(20px, 4vw, 40px); border: 1px solid #c8c0ae; border-radius: 18px; background: #fffdf8; color: #292c26; }
.heritage-practice-kicker { color: #8a392e; font-size: 14px; }
.heritage-practice h2 { margin: 12px 0 18px; font-size: clamp(22px, 3vw, 30px); }
.heritage-practice p { line-height: 1.8; }
.heritage-practice label { display: block; margin: 20px 0 10px; }
.heritage-practice textarea { display: block; box-sizing: border-box; width: 100%; padding: 14px; border: 1px solid #c8c0ae; border-radius: 10px; background: white; color: #292c26; font: inherit; line-height: 1.8; resize: vertical; }
.heritage-practice-note { color: #616259; font-size: 14px; }
.heritage-practice button { margin-top: 12px; padding: 12px 22px; border: 0; border-radius: 8px; background: #8a392e; color: white; font: inherit; cursor: pointer; }
.heritage-practice button:disabled { opacity: .6; cursor: wait; }
</style>
