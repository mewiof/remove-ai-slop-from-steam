(function (root) {
	"use strict";

	const NONE = 0;
	const MINOR = 1;
	const SOME = 2;
	const HEAVY = 3;

	// en - word bounded / cjk - matched anywhere / ru - letter boundaries
	function rx(en, cjk, ru) {
		const parts = [];
		if (en) parts.push("\\b(?:" + en + ")\\b");
		if (cjk) parts.push("(?:" + cjk + ")");
		if (ru)
			parts.push("(?<![\\p{L}\\p{N}])(?:" + ru + ")(?![\\p{L}\\p{N}])");
		return new RegExp(parts.join("|"), "gu");
	}

	const AI = rx(
		"ai|artificial intelligence|generative|genai|neural(?: networks?)?|machine[- ]learning|deep[- ]learning|diffusion|" +
			"midjourney|mid journey|niji(?:journey)?|dall-?e\\d?|chat ?gpt|gpt[- ]?\\w*|openai|suno|udio|eleven ?labs|" +
			"leonardo|novel ?ai|firefly|copilot|gemini|llms?|(?:large )?language models?|text[- ]to[- ]\\w+|tts|meshy|" +
			"tripo\\w*|runway|kling|sora|flux|comfy ?ui|automatic1111|loras?|sdxl|aimodel|upscal\\w*|deepl|" +
			"generat(?:e|ed|es|ing|ion|ions|or|ors)|machine[- ]translat\\w*|ai[- ]\\w+",
		"人工智能|人工智慧|生成|人工知能|생성|인공지능",
		"ии|нейросет\\p{L}*|нейронн\\p{L}* сет\\p{L}*|искусственн\\p{L}* интеллект\\p{L}*|генератив\\p{L}*|сгенерирова\\p{L}*|генерац\\p{L}*",
	);

	const NEGATION = rx(
		"no|not|none|never|nothing|neither|nor|without|zero|cannot|can't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|haven't|hasn't",
		"没有|沒有|并未|並未|未使用|未曾|不使用|不包含|不含|无任何|無任何|并非|並非|不是|绝不|絕不|从未|從未|していません|しておりません|ありません|使用しない|않았|않습니다|않으며|않는|없습니다|없으며|없는",
		"не|нет|без|ни",
	);
	// "not only/not entirely" (+ friends) don't deny anything
	const NOT_NEGATION =
		/^(?:not|n't) (?:only|just|limited|entirely|fully|all|exclusively|solely|completely|100)/;
	// a denied verb covers the whole clause. "No/without" reach forward ("replaced with no-AI art")
	const VERB_NEGATION = /^(?:not|never|cannot|\w+n't)$|^[^a-z]+$/;
	// "No AI in the game, only marketing images"
	const NEGATION_END = rx(
		"only|except|apart from|other than|besides|but|however|instead|so|therefore|thus|hence|which is why|that's why",
		"只|仅|僅|のみ|だけ|除了|所以|因此",
		"только|кроме|лишь|поэтому",
	);

	const HUMAN = rx(
		"by hand|hand[- ]?(?:drawn|made|crafted|painted|written|coded|animated|composed|created)|handmade|handcrafted|manually|" +
			"human[- ](?:made|created|written|drawn|composed)|original|in[- ]house|ourselves|myself|our own|are mine|is mine|are ours|is ours|" +
			"licensed|stock|royalty[- ]free|purchased|bought|asset stores?|procedural\\w*|deterministic|" +
			"(?:made|created|drawn|designed|illustrated|painted|composed|written|voiced|produced|recorded|modell?ed|animated|performed|done|crafted|developed|programmed|" +
			"edited|reviewed|refined|finali[sz]ed|authored|curated|polished|retouched|adjusted|modified|checked|overseen|directed|supervised)" +
			" (?:entirely |solely |exclusively |completely |fully |all )?by (?:me|us|him|her|them|myself|ourselves|our|my|humans?|people|real|a real|hand|professional|" +
			"(?:the |our |real |human |professional |hired )?(?:development |dev |art )?(?:team|developers?|artists?|devs?|composers?|writers?|musicians?|actors?|illustrators?|animators?|designers?))",
		"手绘|手繪|手工|人工绘制|人工繪製|人工制作|人工製作|完全人工|原创|原創|本人|自己|手描き|自作|직접",
		"вручную|сам\\p{L}*",
	);

	const MAKES = rx(
		"generat\\w*|creat\\w*|made|make|produc\\w*|us(?:e|ed|es|ing)|utili[sz]\\w*|includ\\w*|design\\w*|draw\\w*|drawn|render\\w*|" +
			"compos\\w*|writ\\w*|wrote|voic\\w*|assist\\w*|help\\w*|enhanc\\w*|edit\\w*|translat\\w*|animat\\w*|synthesi[sz]\\w*|sourced|obtained",
		"使用|生成|制作|製作|作成|利用|辅助|輔助|사용|제작",
		"использ\\p{L}*|созда\\p{L}*|сделан\\p{L}*",
	);

	// "All AI-generated content was reviewed..." yaps about the AI part again
	const META =
		/\b(?:all|any|every|each)\s+(?:of\s+(?:the|our|these|this|those|which)\s+)?(?:such\s+)?(?:ai|generated|generative|machine)\b|\ball such\b|\bin (?:all|any|each|every) (?:such )?cases?\b/;

	const EXAMPLES =
		/\b(?:including|such as|eg|for example|for instance|like|namely)\b|:/g;

	// quantifiers. Determiners reach forward to the next category (adverbs cover the whole segment)
	const Q_HEAVY = rx(
		"all(?! (?:other|such|of (?:these|those|which)|rights|players|platforms|languages|ages))|every|entire|whole|(?<!the )most(?! (?:important\\w*|of all|notably|likely|recently|of the time))|" +
			"majority|almost all|nearly all|vast majority|the bulk|everything",
		"全部|所有|全都|均为|均為|均由|完全|整个|整個|大部分|大多数|大多數|大量|绝大部分|絕大部分|主要|全て|すべて|ほぼ全て|ほとんど|大半|全面|모든|모두|전부|대부분|전체",
		"все|всё|весь|вся|полностью|целиком|большинств\\p{L}*|большая часть|почти все",
	);
	const Q_HEAVY_ADV = rx(
		"entirely|fully|completely|wholly|totally|mostly|mainly|primarily|predominantly|largely|heavily|extensively|purely",
	);
	const Q_SOME = rx(
		"some|certain|few|a few|one|two(?! (?:hundred|thousand))|several|part of|parts of|a part|portions? of|a portion|selected|select|specific|minor|minimal|" +
			"small (?:amount|number|portion|part|set|selection|subset|fraction|percentage|bits|details|elements|parts|number)s?|" +
			"small(?= (?:\\w+ )?(?:assets?|elements?|details?|items?|props?|icons?|images?|graphics?|pictures?|sprites?|textures?|parts?|things?))|" +
			"limited(?! (?:budget|resources|time|manpower|funds|team))|occasional|a number of|a handful|a couple|a single|one or two|" +
			"individual|secondary|a little|less than|a minority|a bit|a fraction|bits of|elements of|pieces of|placeholders?|temporary|handful",
		"部分|部份|一部|一些|少量|少数|少數|个别|個別|某些|局部|若干|小部分|少し|一部分|일부|약간|몇몇|소량",
		"некоторы\\p{L}*|частично|часть|немного|несколько|отдельны\\p{L}*",
	);
	const Q_SOME_ADV = rx(
		"partially|partly|somewhat|occasionally|sometimes|in part|in places|here and there|sparingly|lightly|slightly|selectively|sporadically|" +
			"in some (?:areas|places|parts|cases|scenes|levels|spots)|in a limited (?:way|capacity|manner|fashion)|" +
			"only|solely|exclusively|just|merely|strictly",
		"只|仅|僅|のみ|だけ",
		"только|лишь",
	);
	const Q_EDIT_AFTER =
		/^\s*(?:edited|reviewed|refined|retouched|modified|reworked|redrawn|checked|curated|controlled|replaced|human|manual|original|by|polished|adjusted|revised|overseen)/;
	const PERCENT = /(\d{1,3}(?:\.\d+)?)\s?%/g;

	// AI processing of existing human work counts as partial use
	const ENHANCE =
		/\b(?:enhanc\w*|upscal\w*|restor\w*|remaster\w*|denois\w*|coloriz\w*|colouriz\w*|interpolat\w*|style transfer|super[- ]resolution|sharpen\w*|refin\w*|enrich\w*|post-?process\w*|mastering|mixing|modif\w*|modulat\w*|alter\w*|edit\w*|pass\w* (?:\w+ )?through)\b|超分|放大|修复|修復|高清化/;

	// stand-ins
	const REPLACED =
		/\b(?:placeholders?|temporary|will be replaced|to be replaced|plan(?:ning)? to replace|be replaced|being replaced|replace (?:them|it|these|those|all|most))\b/;

	// "AI images for the promotion of the game"
	const PURPOSE_MARKETING =
		/\bfor (?:the |our )?(?:promot\w*|marketing|advertis\w*|store page|steam page|storefront|trailers?)\b|\b(?:published|posted) on (?:youtube|instagram|tiktok|social media|twitter|x)\b/;

	// "These could include music"
	const ANAPHORA =
		/^\s*(?:these|they|this|those|which|it|such|the (?:above|following)|specifically|namely|in particular|for example|for instance)\b/;
	const GENERATE =
		/\b(?:generat\w*|creat\w*|made|make|produc\w*|draw\w*|paint\w*|compos\w*|wrote|written|writ\w*)\b|生成|制作|製作|作成/;

	// "generated from our sketches"
	const INPUT_BEFORE =
		/(?:from|based on|using|on top of|over|of our|our own|own|human|hand[- ]drawn|artists?'?s?)\s+(?:\S+\s+){0,2}$/;

	// live generation (Steam's "Live-Generated" disclosure)
	const LIVE_RUNTIME =
		/\b(?:real[- ]?time|at runtime|in runtime|runtime|run[- ]time|on[- ]the[- ]fly|on the spot|on-device|during (?:\w+ )?(?:gameplay|play|matches|the game|a playthrough|runs?)|while (?:you|the player|players) (?:play|are playing)|live[- ]generat\w*|live ai|dynamically generat\w*|generated dynamically|as you play|in[- ]game (?:chat|conversations?))\b|实时|實時|即时|即時|运行时|運行時|动态生成|動態生成|リアルタイム|プレイ中|실시간/;
	const LIVE_GEN =
		/\b(?:generat\w*|creat\w*|respon\w*|dialog\w*|conversation\w*|stor(?:y|ies)|plot\w*|text|images?|npcs?|chat\w*|talk\w*|interact\w*|narrat\w*|content|voices?|music|reacti\w*|questions?)\b|生成|对话|對話|会話|대화/;
	const LIVE_TECH =
		/\b(?:llms?|large language models?|language models?|chat ?bots?|gpt[- ]?\w*|chatgpt|openai api)\b|大语言模型|大語言模型|语言模型|語言模型|言語モデル|언어 모델/;
	const LIVE_CTX =
		/\b(?:players?|npcs?|on-device|locally|at runtime|runtime|respond\w*|conversations? with|chat(?:ting)? with|talk(?:ing)? (?:to|with))\b|玩家|プレイヤー|플레이어/;
	const LIVE_INTERACT =
		/\b(?:players? (?:can|will|may|are able to)(?: freely)? (?:chat|talk|type|ask|draw|write|speak|converse|generate|create|prompt)|(?:talk|chat|converse|speak) (?:freely )?(?:to|with) (?:the |any )?(?:npcs?|characters?|villagers?|ai)|conversations? with (?:the )?(?:npcs?|characters?|ai)|free[- ]?form (?:text|input|dialogue|chat|conversations?)|(?:ai|llm|gpt)[- ](?:powered|driven) (?:npcs?|characters?|dialogues?|conversations?|stor(?:y|ies)|responses?|companions?|opponents? dialogue)|player[- ](?:input|prompts?|provided)|responds? to (?:you|the player|players|your))\b/;
	const LIVE_POWERED =
		/\b(?:powered|driven) by (?:generative )?(?:ai|artificial intelligence|llms?|language models?|gpt\w*)\b/;
	const LIVE_SUBJECT =
		/\b(?:npcs?|characters?|villagers?|companions?|conversations?|dialog\w*|responses?|chat\w*|story|stories|narrat\w*|game master|opponents?|behaviou?rs?)\b/;
	const NOT_LIVE =
		/\b(?:during development|in development|development process|pre-?generated|pre-?rendered|before release|while developing|prior to release|baked)\b/;

	// "character voices" is voice work, not character art
	const OWNER =
		"(?:(?:character|npc|item|enemy|monster|card|quest|level|game|in-game|world|player|tutorial)'?s? )?";

	// [kind, weight, pattern]. Order matters.
	// 0 means use that does not put AI content in the game
	const KINDS = [
		[
			"marketing",
			0,
			rx(
				"(?:marketing|promotional|promo|advertising|advertisement|ad|store|storefront|steam|shop|social media|capsule|key|library|cover|header|banner|thumbnail|trailer)s?" +
					" (?:\\w+ ){0,3}(?:images?|art|artworks?|visuals?|illustrations?|graphics?|pictures?|materials?|assets?|videos?|banners?|texts?|descriptions?|copy|pages?|content|stills|screenshots?|renderings?)|" +
					"(?:images?|art|artworks?|visuals?|illustrations?|graphics?|pictures?|materials?|assets?|videos?|banners?|texts?|descriptions?|translations?|" +
					"backgrounds?|fonts?|icons?|logos?|music|songs?|soundtracks?)(?: \\S+){0,3}?" +
					" (?:for|on|in|of|used (?:in|on|for)) (?:the |our |this |its |some |all |any |a |an )?(?:steam |game'?s? )?" +
					"(?:store|storefront|steam page|store ?page|product page|shop page|shop|web ?page|website|marketing|promotions?|promotional \\w+|advertis\\w*|trailers?|capsules?|social media|library)|" +
					"marketing|promot\\w*|promo|advertis\\w*|storefront|store ?pages?|steam ?pages?|product pages?|trailers?|capsules?|key ?art|logos?|banners?|" +
					"game icon|app icon|desktop icon|library (?:art|assets|images|hero|logo)|social media|youtube|tiktok|instagram|thumbnails?|cover (?:art|images?|photos?|pictures?)|header (?:art|image|capsule)|screenshots?",
				"宣传图片|宣傳圖片|宣传图|宣傳圖|宣传画|宣傳畫|宣传素材|宣傳素材|宣传视频|宣傳影片|商店图片|商店圖片|宣伝画像|宣伝用|홍보 이미지|" +
					"宣传|宣傳|推广|推廣|商店页面|商店頁面|商店页|商店頁|商店图|商店圖|库页面|庫頁面|封面|胶囊|膠囊|广告|廣告|宣伝|ストアページ|プロモーション|広告|サムネイル|ロゴ|标志|標誌|游戏图标|遊戲圖標|主视觉|主視覺|キービジュアル|홍보|마케팅|스토어|광고|로고",
				"маркетинг\\p{L}*|реклам\\p{L}*|промо\\p{L}*|страниц\\p{L}* магазин\\p{L}*|логотип\\p{L}*|обложк\\p{L}*|трейлер\\p{L}*|капсул\\p{L}*",
			),
		],
		[
			"concept",
			0,
			rx(
				"concepts?(?: art| arts| designs?| images?| sketches| ideas| generation| stage| phase)?|conceptual\\w*|references?(?: images?| materials?| art)?|" +
					"inspirations?|ideation|ideas?|brainstorm\\w*|prototyp\\w*|mock[- ]?ups?|drafts?|sketch\\w*|templates?|mood ?boards?|storyboard\\w*|" +
					"pre-?production|pre-?visuali[sz]\\w*|previs|early (?:development|stages?|phases?)|research|planning|exploration|iterat\\w*|bases?|basis|starting points?|first pass(?:es)?",
				"概念|参考|參考|灵感|靈感|创意|創意|草图|草圖|构思|構思|原型|コンセプト|アイデア|ラフ|下書き|컨셉|참고|아이디어|초안|레퍼런스",
				"концепт\\p{L}*|референс\\p{L}*|иде\\p{L}*|прототип\\p{L}*|черновик\\p{L}*|наброс\\p{L}*",
			),
		],
		[
			"translation",
			0,
			rx(
				"translat\\w*|locali[sz]\\w*|languages?|proofread\\w*|grammar|grammatic\\w*|spell[- ]?check\\w*|spelling|subtitles?|correct(?:s|ed|ing|ions?)?",
				"翻译|翻譯|本地化|在地化|多语言|多語言|翻訳|ローカライズ|多言語|번역|현지화|다국어",
				"перевод\\p{L}*|локализ\\p{L}*|язык\\p{L}*",
			),
		],
		[
			"code",
			0,
			rx(
				"code|codes|coding|coded|codebase|programming|programmed|scripting|debug\\w*|refactor\\w*|copilot|cursor|shaders?|javascript|python|" +
					"gdscript|blueprints?|software development|game logic|logic|bugs?|optimi[sz]\\w*|tooling|development tools?|editor tools?|unity editor|" +
					"(?:dev|development) (?:assist\\w*|process|workflow|pipeline)|(?:art |content |creative )?production (?:process|pipeline|workflow)s?|" +
					"productivity|implementation|documentation|spreadsheets?|balancing",
				"c#|c\\+\\+|代码|代碼|程式|程序|编程|編程|コード|プログラム|코드|프로그래밍",
				"код\\p{L}*|программ\\p{L}*|скрипт\\p{L}*",
			),
		],
		// music in menus or credits
		[
			"ui",
			0.3,
			rx(
				"(?:main menu|menu|credits?|title|lobby|ending|loading screen) (?:music|songs?|themes?|tracks?|bgm)",
			),
		],
		[
			"voice",
			0.8,
			rx(
				OWNER +
					"(?:dialog(?:ue)? (?:voices?|audio|lines? audio)|voiced dialog(?:ue)?|(?:audio|voiced?) (?:versions? of )?(?:the )?dialog(?:ue)?s?|" +
					"voices?(?:[- ]?overs?| acting| actors?| lines?| work| clips?| recordings?| performances?)?|voiced|vo|narrat(?:ion|or|ors|ed)|dubbing|dubbed|" +
					"speech|text[- ]to[- ]speech|tts|spoken (?:lines|dialogue)|singing|vocals?|announcers?|commentators?|(?:background|ambient) voices?)",
				"配音|语音|語音|人声|人聲|旁白|ボイス|音声|声優|ナレーション|음성|보이스|목소리|더빙|내레이션",
				"озвуч\\p{L}*|голос\\p{L}*|диктор\\p{L}*",
			),
		],
		[
			"music",
			1,
			rx(
				OWNER +
					"(?:background (?:music|sounds?|noises?|tracks?|audio|ambien\\w*)|music|musics|musical|soundtracks?|osts?|bgm|noises|beeps|boops|songs?|tracks?|melod\\w*|tunes?|jingles?|" +
					"sound ?effects?|sfx|sounds?|audio|ambien(?:ce|t)(?: sounds?| music| audio| tracks?)?|atmospheric sounds?|soundscapes?|instrumentals?|beats)",
				"背景音乐|背景音樂|音乐|音樂|音效|配乐|配樂|歌曲|音频|音頻|音訊|声音|聲音|楽曲|音楽|効果音|サウンド|음악|배경음악|효과음|사운드|노래",
				"музык\\p{L}*|саундтрек\\p{L}*|звук\\p{L}*|аудио|песн\\p{L}*|мелоди\\p{L}*",
			),
		],
		[
			"ui",
			0.3,
			rx(
				"(?:loading|title|menu|start|splash|main menu|main|pause|game over|ending|victory|load) ?screens?(?: images?| art| backgrounds?| illustrations?)?|" +
					"(?:user )?(?:menu|ui|interface|hud|cutscene|loading|lobby|inventory|achievement|item|skill|ability|button) (?:\\w+ ){0,2}" +
					"(?:images?|art|artworks?|backgrounds?|illustrations?|graphics?|icons?|frames?|elements?)|" +
					"icons?|ui|user interfaces?|interfaces?|hud|menus?|fonts?|avatars?|achievements?|emojis?|emotes?|decals?|stickers?|posters?|" +
					"(?:art|artworks?|images?|illustrations?|pictures?|backgrounds?|graphics?)(?: \\S+){0,3}? (?:on|in|for) (?:the |our )?(?:in-game )?" +
					"(?:loading|title|menu|main menu|pause|start|splash) ?screens?|graphics for (?:the )?(?:ui|interfaces?|menus?|hud)|wall (?:art|paintings?)|(?:a|one|single) (?:\\w+ )?(?:asset|image|picture|illustration|photo|photograph)|particles?|vfx|(?:visual )?effects|skybox(?:es)?",
				"图标|圖標|圖示|アイコン|界面|ロゴ|字体|字體|头像|頭像|成就|载入画面|載入畫面|加载界面|加載界面|ローディング|タイトル画面|メニュー|아이콘|로딩|메뉴|폰트",
				"иконк\\p{L}*|интерфейс\\p{L}*|меню|шрифт\\p{L}*|аватар\\p{L}*",
			),
		],
		[
			"story",
			2,
			rx(
				OWNER +
					"(?:stor(?:y|ies|yline|ylines|ytelling|y telling)|plots?|narratives?|dialog(?:ue)?s?|scripts?|screenplays?|scenarios?|lore|chapters?|" +
					"conversations?|(?:game|in-game) (?:text|writing)|backstor(?:y|ies)|poems?|poetry|lyrics)",
				"剧情|劇情|剧本|劇本|故事|对话|對話|台词|台詞|文案|小说|小說|シナリオ|ストーリー|セリフ|物語|会話|스토리|대사|시나리오|대화",
				"сюжет\\p{L}*|диалог\\p{L}*|сценари\\p{L}*|истори\\p{L}*|рассказ\\p{L}*",
			),
		],
		[
			"text",
			0.8,
			rx(
				OWNER +
					"(?:texts?|descriptions?|names|naming|flavou?r text|tooltips?|wording|letters?|notes|books?|documents?|messages?|tips|hints|questions)",
				"文本|文字|文章|テキスト|텍스트",
				"текст\\p{L}*|описани\\p{L}*",
			),
		],
		[
			"design",
			1,
			rx(
				OWNER +
					"(?:level design|levels?|maps?|puzzles?|quests?|missions?|dungeons?|game design|enemy design|encounters?)",
				"关卡|關卡|地图|地圖|谜题|謎題|任务|任務|マップ|ステージ|ダンジョン|レベルデザイン|맵|레벨|퀘스트|던전",
				"уров\\p{L}*|карт(?:а|ы|у|ой|е|ам|ами|ах)?|головоломк\\p{L}*|квест\\p{L}*",
			),
		],
		[
			"art",
			2,
			rx(
				"art|arts|artwork|artworks|graphics?|graphical(?: assets?| elements?)?|images?|imagery|pictures?|pics?|illustrat\\w*|drawings?|paintings?|" +
					"sprites?|spritesheets?|textures?|(?:3d |character |environment |prop )?models?|meshes|backgrounds?|backdrops?|" +
					"characters(?: designs?| art| portraits?| sprites?| images?| illustrations?| models?)?|" +
					"character (?:designs?|art|portraits?|sprites?|images?|illustrations?|models?)|portraits?|cgs?|visuals|visual (?:assets?|materials?|elements?|content|resources?)|visual(?= (?:and|&) (?:audio|sound))|scenes?|scenery|environments?|" +
					"tilesets?|tiles|animations?|animated|cutscenes?|cinematics?|videos?|footage|photos?|photographs?|cards?(?: art)?|props?|skins?|outfits?|" +
					"costumes?|2d|3d|pixel art|stills?|weapons?|vehicles?|ships?|buildings?|landscapes?|" +
					"terrain|facial expressions?|expressions?",
				"美术|美術|美工|图像|圖像|图片|圖片|画像|画面|立绘|立繪|立ち絵|插画|插畫|插图|插圖|イラスト|背景|角色|キャラクター|キャラ|场景|場景|" +
					"贴图|貼圖|テクスチャ|模型|建模|モデル|原画|原畫|スチル|一枚絵|形象|动画|動畫|アニメーション|이미지|일러스트|배경|캐릭터|그래픽|텍스처|모델|아트|그림|애니메이션|원화",
				"арт|арты|арта|графи\\p{L}*|изображени\\p{L}*|картин\\p{L}*|иллюстрац\\p{L}*|рисун\\p{L}*|текстур\\p{L}*|модел\\p{L}*|спрайт\\p{L}*|" +
					"фон|фоны|фонов\\p{L}*|персонаж\\p{L}*|анимац\\p{L}*|визуал\\p{L}*|сцен\\p{L}*|окружени\\p{L}*",
			),
		],
		[
			"content",
			1.5,
			rx(
				"assets?|content|contents|materials?|resources?|elements?|everything|media|creative work|components?|entire game|whole game|game content",
				"内容|內容|资源|資源|素材|コンテンツ|リソース|アセット|콘텐츠|에셋|리소스",
				"контент\\p{L}*|ресурс\\p{L}*|материал\\p{L}*|ассет\\p{L}*",
			),
		],
	];
	const WEIGHT = Object.fromEntries(
		KINDS.map(([kind, weight]) => [kind, weight]),
	);
	const GENERIC_ART =
		/^(?:art|arts|artwork|artworks|graphics?|graphical|images?|imagery|pictures?|pics?|visuals?|2d|3d)\b/;
	const FACTOR = { heavy: 2.5, plain: 1, some: 0.3 };

	function normalize(text) {
		return (
			String(text || "")
				.normalize("NFKC")
				.toLowerCase()
				.replace(/[\u2018\u2019\u201a\u201b\u02bc\u2032]/g, "'")
				.replace(/[\u201c\u201d\u201e\u2033]/g, '"')
				.replace(/[\u2010\u2011\u2012]/g, "-")
				.replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
				.replace(/\u00a0/g, " ")
				.replace(/[\u00b4`]/g, "'")
				// quoted answers (like "Yes"/"No") are not denials
				.replace(/"[^"]{1,24}"/g, " quoted ")
				.replace(/\be,g\b/g, "eg")
				.replace(/\ba\.i\.?(?=\W|$)/g, "ai")
				.replace(/\be\.g\.?|\bi\.e\.?|\betc\.|\bvs\./g, (m) =>
					m.replace(/\./g, ""),
				)
				.replace(/(\d)\.(\d)/g, "$1,$2")
				// nouns that look like art/text words but mean something else
				.replace(/\b(?:visual|graphic|light|web) novels?\b/g, "vn")
				.replace(
					/\b(?:ai|language|diffusion|generative|lora|self-trained|trained|ml|neural|open-source|commercial|licensed|base|foundation) models?\b/g,
					" aimodel ",
				)
				.replace(/,? ?but (?:is |are )?not limited to:?/g, "")
				.replace(/\bstate of the art\b/g, "modern")
				.replace(/\bart (?:style|direction)\b/g, "style")
				.replace(/\s+/g, " ")
		);
	}

	const SPLIT =
		/[.!?;\n\u3002\uff01\uff1f\uff1b\u2022\u00b7\u2013\u2014\u2015|]+|\s-\s|\b(?:but|however|whereas|although)\b|但是|不过|不過|但|しかし|ただし|하지만|그러나|(?<![\p{L}])но(?![\p{L}])/u;

	function blank(s, start, end) {
		return s.slice(0, start) + " ".repeat(end - start) + s.slice(end);
	}

	function has(re, s) {
		re.lastIndex = 0;
		const r = re.test(s);
		re.lastIndex = 0;
		return r;
	}

	function matches(re, s) {
		re.lastIndex = 0;
		const out = [];
		let m;
		while ((m = re.exec(s))) {
			if (m[0].length === 0) {
				re.lastIndex++;
				continue;
			}
			out.push({
				start: m.index,
				end: m.index + m[0].length,
				text: m[0],
			});
		}
		return out;
	}

	// blank whatever a denial/human-made claim covers
	function dropDenied(seg, listy, implied) {
		let s = seg;
		for (const n of matches(NEGATION, seg)) {
			if (NOT_NEGATION.test(seg.slice(n.start))) continue;
			if (s.slice(n.start, n.end).trim() === "") continue;
			const before = seg.slice(0, n.start);
			const cut = Math.max(
				before.lastIndexOf(","),
				before.search(/[\uff0c\u3001][^\uff0c\u3001]*$/),
			);
			const start = !VERB_NEGATION.test(n.text)
				? n.start
				: cut < 0
					? 0
					: cut;
			let end = s.length;
			for (const e of matches(NEGATION_END, seg)) {
				if (e.start > n.end) {
					end = e.start;
					break;
				}
			}
			s = blank(s, start, end);
		}
		const segHasAI = has(AI, s);
		if (!segHasAI) {
			if (has(HUMAN, s)) return "";
			// "Music, Sound Effects" counts. "The final visuals meet our quality bar" not
			if (listy || implied || has(MAKES, s)) return s;
			const words =
				s.trim().split(/\s+/).length +
				(
					s.match(
						/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
					) || []
				).length /
					2;
			if (
				words <= 8 &&
				!/\b(?:is|are|was|were|be|been|has|have|had|do|does|did|will|can|may)\b/.test(
					s,
				)
			)
				return s;
			return "";
		}
		// the segment names AI. Drop comma parts that claim human work
		const re = /[^,\uff0c\u3001]+/g;
		let m;
		while ((m = re.exec(s))) {
			if (!has(AI, m[0]) && has(HUMAN, m[0]))
				s = blank(s, m.index, m.index + m[0].length);
		}
		return s;
	}

	function quantifiers(s) {
		const out = [];
		let t = s;
		for (const q of matches(Q_HEAVY, t)) {
			out.push({ pos: q.start, end: q.end, q: "heavy", det: true });
			t = blank(t, q.start, q.end);
		}
		for (const q of matches(Q_SOME, t)) {
			out.push({ pos: q.start, end: q.end, q: "some", det: true });
			t = blank(t, q.start, q.end);
		}
		for (const p of matches(PERCENT, s)) {
			const v = parseFloat(p.text.replace(",", "."));
			out.push({
				pos: p.start,
				end: p.end,
				q: v >= 50 ? "heavy" : "some",
				det: true,
			});
		}
		for (const q of matches(Q_HEAVY_ADV, t)) {
			if (Q_EDIT_AFTER.test(s.slice(q.end))) continue;
			out.push({ pos: q.start, end: q.end, q: "heavy", det: false });
		}
		for (const q of matches(Q_SOME_ADV, t))
			out.push({ pos: q.start, end: q.end, q: "some", det: false });
		return out.sort((a, b) => a.pos - b.pos);
	}

	// quantity for a mention
	function quantityAt(qs, s, pos, end) {
		let det = null;
		for (const q of qs) {
			if (!q.det || q.end > pos) continue;
			if (pos - q.end <= 150) det = q;
		}
		if (det) return det.q;
		const next = qs.find(
			(q) =>
				q.det &&
				q.pos >= end &&
				/^\s*(?:of|in|on|for|from)\s+(?:the\s+)?$/.test(
					s.slice(end, q.pos),
				),
		);
		if (next) return next.q;
		const adv = qs.find((q) => !q.det);
		if (adv) return adv.q;
		return "plain";
	}

	function denies(seg) {
		return matches(NEGATION, seg).some(
			(n) => !NOT_NEGATION.test(seg.slice(n.start)),
		);
	}

	function isLive(seg) {
		if (!has(AI, seg) && !LIVE_TECH.test(seg)) return false;
		if (denies(seg)) return false;
		if (NOT_LIVE.test(seg)) return false;
		if (/\blive[- ]generat\w*/.test(seg)) return true;
		if (LIVE_RUNTIME.test(seg) && LIVE_GEN.test(seg)) return true;
		if (LIVE_INTERACT.test(seg)) return true;
		if (LIVE_POWERED.test(seg) && LIVE_SUBJECT.test(seg)) return true;
		if (LIVE_TECH.test(seg) && LIVE_CTX.test(seg)) return true;
		return false;
	}

	function classify(text) {
		const norm = normalize(text);
		if (!norm.trim()) return { level: NONE, kinds: [], score: 0 };

		const found = []; // { kind, q, seg }
		let live = false;
		let lastQ = "plain";
		const segments = norm.split(SPLIT).filter((s) => s && s.trim());
		const implied = !has(AI, norm);

		segments.forEach((whole, segIndex) => {
			const listy =
				(segIndex > 0 && segments[segIndex - 1].trim().endsWith(":")) ||
				/^\s*(?:only|just|except)\b/.test(whole);
			const meta = whole.search(META);
			const raw = meta < 0 ? whole : whole.slice(0, meta);
			if (!raw.trim()) return;
			if (isLive(raw)) live = true;
			let s = dropDenied(raw, listy, implied);
			if (!s.trim()) return;

			const text = s;
			const qs = quantifiers(text);
			const inherit =
				!qs.length && (listy || ANAPHORA.test(raw)) ? lastQ : null;
			const mentions = [];
			for (const [kind, , re] of KINDS) {
				for (const m of matches(re, s)) {
					if (
						kind === "concept" &&
						INPUT_BEFORE.test(
							s.slice(Math.max(0, m.start - 40), m.start),
						)
					) {
						s = blank(s, m.start, m.end);
						continue;
					}
					mentions.push({
						kind,
						pos: m.start,
						end: m.end,
						generic: kind === "art" && GENERIC_ART.test(m.text),
					});
					s = blank(s, m.start, m.end);
				}
			}
			if (!mentions.length) return;
			mentions.sort((a, b) => a.pos - b.pos);

			const ex = matches(EXAMPLES, raw)[0];
			let headQ = null;
			if (ex) {
				const after = mentions.filter((m) => m.pos >= ex.end);
				const head = mentions.filter(
					(m) => m.pos < ex.start && WEIGHT[m.kind] > 0,
				);
				if (head.length)
					headQ = quantityAt(
						qs,
						text,
						head[head.length - 1].pos,
						head[head.length - 1].end,
					);
				// the examples are all small things (icons/logos/marketing)
				const small = Math.max(-1, ...after.map((m) => WEIGHT[m.kind]));
				const before = mentions.filter((m) => m.pos < ex.start);
				const headWord = before[before.length - 1];
				if (
					after.length &&
					small <= WEIGHT.ui &&
					headWord &&
					WEIGHT[headWord.kind] > small
				)
					mentions.splice(mentions.indexOf(headWord), 1);
			}

			// "store page art was AI art"
			if (mentions.some((m) => WEIGHT[m.kind] <= WEIGHT.ui)) {
				for (let i = mentions.length - 1; i >= 0; i--) {
					const m = mentions[i];
					if (
						WEIGHT[m.kind] > WEIGHT.ui &&
						/\b(?:ai|ai[- ]generated|generated|generative ai)\s*$/.test(
							text.slice(Math.max(0, m.pos - 20), m.pos),
						)
					)
						mentions.splice(i, 1);
				}
			}

			// "reference material for backgrounds"
			for (let i = mentions.length - 1; i > 0; i--) {
				const prev = mentions[i - 1];
				if (
					prev.kind === "concept" &&
					WEIGHT[mentions[i].kind] > 0 &&
					/^\s*(?:\w+\s+)?(?:for|of)\s+(?:the\s+|our\s+|some\s+)?$/.test(
						text.slice(prev.end, mentions[i].pos),
					)
				)
					mentions.splice(i, 1);
			}

			// "Concept art and drafts"
			const chunk = (pos) =>
				(text.slice(0, pos).match(/[,\uff0c\u3001]/g) || []).length;
			const conceptChunks = new Set(
				mentions
					.filter((m) => m.kind === "concept")
					.map((m) => chunk(m.pos)),
			);
			const translation = mentions.some((m) => m.kind === "translation");
			const marketing = PURPOSE_MARKETING.test(raw);
			const enhanceOnly = ENHANCE.test(raw) && !GENERATE.test(raw);
			let lastVoice = -1;
			for (const m of mentions) {
				let kind = m.kind;
				// translated dialogue is still human writing
				if (translation && (kind === "text" || kind === "story"))
					continue;
				// "the voices in the customer dialogues"
				if (kind === "voice") lastVoice = m.end;
				else if (
					kind === "story" &&
					lastVoice >= 0 &&
					m.pos - lastVoice <= 40
				)
					kind = "voice";
				if (marketing && WEIGHT[kind] > 0) kind = "marketing";
				let q = inherit || quantityAt(qs, text, m.pos, m.end);
				if (q === "plain" && headQ && ex && m.pos >= ex.end) q = headQ;
				if (
					WEIGHT[kind] > 0 &&
					(conceptChunks.has(chunk(m.pos)) || enhanceOnly)
				)
					q = "some";
				found.push({ kind, q, seg: segIndex, generic: m.generic });
				if (WEIGHT[kind] > 0) lastQ = q;
			}
		});

		// generic words ("assets", "content")
		const specific = found.some(
			(f) => f.kind !== "content" && WEIGHT[f.kind] > 0,
		);
		const minorSegs = new Set(
			found.filter((f) => WEIGHT[f.kind] === 0).map((f) => f.seg),
		);
		// "Uses AI visual content. AI made selected artwork."
		const someArt =
			found.some((f) => f.kind === "art" && f.q === "some") &&
			!found.some((f) => f.kind === "art" && f.q === "heavy");
		const kept = found.filter(
			(f) =>
				(f.kind !== "content" ||
					(!specific && !minorSegs.has(f.seg))) &&
				!(someArt && f.generic && f.q === "plain"),
		);

		const best = {};
		for (const f of kept) {
			const v = WEIGHT[f.kind] * FACTOR[f.q];
			if (!(f.kind in best) || v > best[f.kind]) best[f.kind] = v;
		}
		const score = Object.values(best).reduce((a, b) => a + b, 0);
		const kinds = Object.keys(best);
		if (live) kinds.unshift("live");

		let level = MINOR;
		if (live || score >= 2) level = HEAVY;
		else if (score > 0) level = SOME;
		// placeholders on their way out stay partial (unless the text also has "all/most")
		if (
			level === HEAVY &&
			!live &&
			REPLACED.test(norm) &&
			!kept.some((f) => f.q === "heavy")
		)
			level = SOME;
		return { level, kinds, score: Math.round(score * 100) / 100 };
	}

	const api = { classify, normalize, NONE, MINOR, SOME, HEAVY };
	root.AiSlopClassify = api;
	if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
