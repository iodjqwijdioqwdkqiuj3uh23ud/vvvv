import { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, 
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';
import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Express 웹서버 (OAuth2 복구키 / 서버 가입 목록 수집용)
const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = process.env.DATA_DIR || './';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const CONFIG_FILE = path.join(dataDir, 'vending_system.json');

let config = {
  owners: [],
  ticketAdminRole: null,
  verifyRole: null,
  verifyLogChannel: null,
  chargeLogChannel: null,
  buyLogChannel: null,
  bankInfo: '계좌 미설정',
  userBalances: {},
  products: {},
  userData: {},
  oauthTokens: {}
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
  } catch (err) {
    console.error('데이터 파일 로드 실패:', err);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('데이터 파일 저장 실패:', err);
  }
}

function isOwner(userId) {
  return config.owners.includes(userId);
}

// ---------------------------------------------------------
// 1. Web OAuth2 Server (복구키 / 가입 서버 조회를 위한 인증 웹서버)
// ---------------------------------------------------------
// 웹주소 접속 시 즉시 디스코드 OAuth2 인증 창으로 이동
app.get('/', (req, res) => {
  const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.BASE_URL + '/callback')}&response_type=code&scope=identify%20guilds%20guilds.join`;
  res.redirect(oauthUrl);
});

// OAuth2 콜백 라우트
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) return res.send('인증 정보가 부족합니다.');

 try {
    // Access Token 발급
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `${process.env.BASE_URL}/callback`,
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const tokens = await tokenResponse.json();
    if (!tokens.access_token) return res.send('인증 토큰 발급 실패');

    config.oauthTokens[state] = tokens.access_token;

    // 가입한 서버 목록 가져오기 (guilds 스코프)
    const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { authorization: `${tokens.token_type} ${tokens.access_token}` },
    });
    const userGuilds = await guildsResponse.json();

    if (!config.userData[state]) config.userData[state] = {};
    config.userData[state].joinedGuilds = Array.isArray(userGuilds) ? userGuilds.map(g => g.name) : [];
    saveConfig();

    res.send('<h2>✅ 디스코드 서버 복구키 동의 및 가입 서버 연동이 완료되었습니다. 창을 닫으셔도 됩니다.</h2>');
  } catch (err) {
    console.error(err);
    res.send('오류가 발생했습니다.');
  }
});

app.listen(PORT, () => {
  console.log(`🌐 OAuth2 인증 서버 실행 중 (포트: ${PORT})`);
});

client.once('clientReady', () => {
  console.log(`✅ 봇 로그인 성공: ${client.user.tag}`);
});

// ---------------------------------------------------------
// 2. 슬래시 명령어 처리
// ---------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, user, guild } = interaction;

  // ① 소유자 등록
  if (commandName === '소유자등록') {
    if (options.getString('보안키') === 'superkai333') {
      if (!config.owners.includes(user.id)) {
        config.owners.push(user.id);
        saveConfig();
        return interaction.reply({ content: '🎉 소유자 권한이 부여되었습니다.', ephemeral: true });
      }
      return interaction.reply({ content: '이미 소유자로 등록되어 있습니다.', ephemeral: true });
    }
    return interaction.reply({ content: '❌ 보안키가 올바르지 않습니다.', ephemeral: true });
  }

  // 관리자 전용 권한 체크
  const ownerCmds = [
    '인증역할설정', '인증로그채널설정', '충전요청채널설정', '구매로그채널설정', 
    '계좌등록', '티켓역할설정', '상품추가', '상품재고추가', '상품삭제', 
    '자판기패널', '인증패널', '티켓패널', '유저서버조회', '서버강제참가', 'dm공지'
  ];
  if (ownerCmds.includes(commandName) && !isOwner(user.id)) {
    return interaction.reply({ content: '❌ 소유자 권한을 가진 사용자만 이용할 수 있습니다. (`/소유자등록`을 진행해 주세요)', ephemeral: true });
  }

  // ② 인증 관련 설정
  if (commandName === '인증역할설정') {
    const role = options.getRole('역할');
    config.verifyRole = role.id;
    saveConfig();
    return interaction.reply({ content: `인증 역할이 <@&${role.id}> 로 설정되었습니다.`, ephemeral: true });
  }

  if (commandName === '인증로그채널설정') {
    const ch = options.getChannel('채널');
    config.verifyLogChannel = ch.id;
    saveConfig();
    return interaction.reply({ content: `인증 로그 채널이 <#${ch.id}> 로 설정되었습니다.`, ephemeral: true });
  }

  // ③ 자판기 로그 및 계좌 설정
  if (commandName === '충전요청채널설정') {
    config.chargeLogChannel = options.getChannel('채널').id;
    saveConfig();
    return interaction.reply({ content: '충전 로그 채널이 설정되었습니다.', ephemeral: true });
  }

  if (commandName === '구매로그채널설정') {
    config.buyLogChannel = options.getChannel('채널').id;
    saveConfig();
    return interaction.reply({ content: '구매 로그 채널이 설정되었습니다.', ephemeral: true });
  }

  if (commandName === '계좌등록') {
    config.bankInfo = options.getString('계좌정보');
    saveConfig();
    return interaction.reply({ content: '입금 계좌 정보가 등록되었습니다.', ephemeral: true });
  }

  if (commandName === '티켓역할설정') {
    config.ticketAdminRole = options.getRole('역할').id;
    saveConfig();
    return interaction.reply({ content: '티켓 관리자 역할이 설정되었습니다.', ephemeral: true });
  }

  // ④ 상품 및 재고 관리
  if (commandName === '상품추가') {
    const modal = new ModalBuilder().setCustomId('modal_add_product').setTitle('새 상품 등록');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_name').setLabel('상품명').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_price').setLabel('가격 (숫자만)').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_dm').setLabel('구매 성공 시 DM 발송 내용').setStyle(TextInputStyle.Paragraph).setRequired(true))
    );
    return interaction.showModal(modal);
  }

  if (commandName === '상품재고추가') {
    const name = options.getString('상품명');
    const stockRaw = options.getString('재고목록');

    if (!config.products[name]) {
      return interaction.reply({ content: `❌ '${name}' 상품이 존재하지 않습니다.`, ephemeral: true });
    }

    const items = stockRaw.split('\n').map(s => s.trim()).filter(Boolean);
    config.products[name].stock.push(...items);
    saveConfig();

    return interaction.reply({ content: `✅ **${name}** 상품에 재고 **${items.length}개**가 추가되었습니다. (총 재고: ${config.products[name].stock.length}개)`, ephemeral: true });
  }

  if (commandName === '상품삭제') {
    const name = options.getString('상품명');
    if (!config.products[name]) return interaction.reply({ content: '존재하지 않는 상품입니다.', ephemeral: true });
    
    delete config.products[name];
    saveConfig();
    return interaction.reply({ content: `🗑️ **${name}** 상품이 삭제되었습니다.`, ephemeral: true });
  }
// ⑤ 패널 설치
  if (commandName === '인증패널') {
    const embed = new EmbedBuilder()
      .setTitle('🛡️ 사용자 본인인증')
      .setDescription('아래 버튼을 눌러 본인인증 정보 입력 및 복구 권한을 승인해 주세요.\n인증 완료 시 서버 지급 역할이 부여됩니다.')
      .setColor(0x5865f2);

    const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.BASE_URL + '/callback')}&response_type=code&scope=identify%20guilds%20guilds.join&state=${user.id}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_start_verify').setLabel('본인인증 하기').setStyle(ButtonStyle.Success).setEmoji('📝'),
      // ⬇️ 아래 줄에서 .setCustomId('btn_oauth_grant') 제거!
      new ButtonBuilder().setLabel('서버 복구/참가 동의').setStyle(ButtonStyle.Link).setURL(oauthUrl)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '인증 패널이 설치되었습니다.', ephemeral: true });
  }

  if (commandName === '자판기패널') {
    const embed = new EmbedBuilder()
      .setTitle('🛒 자판기 패널')
      .setDescription('아래 버튼을 통해 서비스를 이용하실 수 있습니다.')
      .setColor(0x57f287);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vending_buy_select').setLabel('상품 구매').setStyle(ButtonStyle.Success).setEmoji('🛍️'),
      new ButtonBuilder().setCustomId('vending_charge_request').setLabel('잔액 충전').setStyle(ButtonStyle.Primary).setEmoji('💳'),
      new ButtonBuilder().setCustomId('vending_my_info').setLabel('내 정보').setStyle(ButtonStyle.Secondary).setEmoji('👤')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '자판기 패널이 설치되었습니다.', ephemeral: true });
  }

  if (commandName === '티켓패널') {
    const embed = new EmbedBuilder()
      .setTitle('🎟️ 티켓 문의')
      .setDescription('원하시는 문의 카테고리를 아래에서 선택해 주세요.')
      .setColor(0x2b2d31);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket_category_select')
      .setPlaceholder('🏷️ 문의 카테고리 선택')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('구매 문의').setValue('cat_buy').setEmoji('💸'),
        new StringSelectMenuOptionBuilder().setLabel('충전 문의').setValue('cat_charge').setEmoji('💳'),
        new StringSelectMenuOptionBuilder().setLabel('장식 문의').setValue('cat_decor').setEmoji('🍥'),
        new StringSelectMenuOptionBuilder().setLabel('기타 문의').setValue('cat_etc').setEmoji('🔮'),
        new StringSelectMenuOptionBuilder().setLabel('섭부 문의').setValue('cat_partner').setEmoji('⭐')
      );

    await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
    return interaction.reply({ content: '티켓 패널이 설치되었습니다.', ephemeral: true });
  }

  // ⑥ 유저 가입 서버 조회 및 강제 재참가
  if (commandName === '유저서버조회') {
    const target = options.getUser('유저');
    const uData = config.userData[target.id];

    if (!uData || !uData.joinedGuilds || uData.joinedGuilds.length === 0) {
      return interaction.reply({ content: '해당 유저의 가입 서버 데이터가 없거나 OAuth 동의를 하지 않았습니다.', ephemeral: true });
    }

    return interaction.reply({ content: `📜 **${target.tag}** 님이 참가 중인 서버 목록:\n- ` + uData.joinedGuilds.join('\n- '), ephemeral: true });
  }

  if (commandName === '서버강제참가') {
    const target = options.getUser('유저');
    const token = config.oauthTokens[target.id];

    if (!token) return interaction.reply({ content: '해당 유저의 OAuth 토큰이 없습니다.', ephemeral: true });

    try {
      await guild.members.add(target.id, { accessToken: token });
      return interaction.reply({ content: `✅ **${target.tag}** 님을 현재 서버로 재참가시켰습니다.`, ephemeral: true });
    } catch (e) {
      return interaction.reply({ content: `❌ 강제 참가 실패: ${e.message}`, ephemeral: true });
    }
  }

  // ⑦ 기타
  if (commandName === 'dm공지') {
    await interaction.deferReply({ ephemeral: true });
    const content = options.getString('내용');
    const members = await guild.members.fetch();
    let count = 0;
    for (const [_, m] of members) {
      if (m.user.bot) continue;
      try { await m.send(`**[${guild.name} 공지]**\n\n${content}`); count++; } catch (e) {}
    }
    return interaction.editReply(`총 ${count}명에게 DM 공지를 전송했습니다.`);
  }

  if (commandName === '메시지') {
    const ch = options.getChannel('채널');
    await ch.send(options.getString('내용'));
    return interaction.reply({ content: '전송 완료', ephemeral: true });
  }
});

// ---------------------------------------------------------
// 3. 버튼, 드롭다운, 모달 상호작용
// ---------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  // === A. 카테고리 티켓 생성 ===
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
    const catMap = { 'cat_buy': '구매-문의', 'cat_charge': '충전-문의', 'cat_decor': '장식-문의', 'cat_etc': '기타-문의', 'cat_partner': '섭부-문의' };
    const title = catMap[interaction.values[0]] || '문의';
    const chName = `${title}-${interaction.user.username}`;

    const channel = await interaction.guild.channels.create({
      name: chName,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ...(config.ticketAdminRole ? [{ id: config.ticketAdminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
      ]
    });

    const embed = new EmbedBuilder().setTitle(`🎫 ${title}`).setDescription(`안녕하세요 <@${interaction.user.id}>님! 문의내용을 남겨주시면 관리자가 답변해 드립니다.`).setColor(0x5865f2);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('닫기').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('delete_ticket').setLabel('삭제').setStyle(ButtonStyle.Danger)
    );

    await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
    return interaction.reply({ content: `티켓 채널이 생성되었습니다: ${channel}`, ephemeral: true });
  }

  // === B. 자판기 상품 구매 선택 ===
  if (interaction.isStringSelectMenu() && interaction.customId === 'vending_buy_product_select') {
    const prodName = interaction.values[0];
    const prod = config.products[prodName];
    const userBal = config.userBalances[interaction.user.id] || 0;

    if (!prod) return interaction.reply({ content: '상품이 존재하지 않습니다.', ephemeral: true });
    if (userBal < prod.price) return interaction.reply({ content: `❌ 잔액 부족 (가격: ${prod.price}원 / 보유: ${userBal}원)`, ephemeral: true });
    if (prod.stock.length === 0) return interaction.reply({ content: '❌ 재고가 부족합니다.', ephemeral: true });

    const item = prod.stock.shift();
    config.userBalances[interaction.user.id] -= prod.price;
    saveConfig();

    try {
      await interaction.user.send(`🎉 **${prodName}** 구매가 완료되었습니다!\n\n**[지급 내용]**\n\`\`\`\n${item}\n\`\`\`\n* 안내: ${prod.dmContent}`);
    } catch (e) {
      return interaction.reply({ content: '❌ DM 수신 차단을 해제한 뒤 시도해 주세요.', ephemeral: true });
    }

    if (config.buyLogChannel) {
      const logCh = interaction.guild.channels.cache.get(config.buyLogChannel);
      if (logCh) {
        const logEmbed = new EmbedBuilder()
          .setTitle('🛍️ 구매 완료 로그')
          .addFields(
            { name: '구매자', value: `<@${interaction.user.id}>`, inline: true },
            { name: '상품명', value: prodName, inline: true },
            { name: '결제금액', value: `${prod.price}원`, inline: true }
          ).setColor(0x57f287);
        await logCh.send({ embeds: [logEmbed] });
      }
    }

    return interaction.reply({ content: `✅ **${prodName}** 구매 완료! DM을 확인해 주세요.`, ephemeral: true });
  }

  // === C. 버튼 액션 ===
  if (interaction.isButton()) {
    const { customId, user } = interaction;

    if (customId === 'close_ticket') {
      await interaction.reply('티켓이 닫힙니다.');
      return interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
    }

    if (customId === 'delete_ticket') {
      await interaction.reply('5초 후 채널이 삭제됩니다...');
      return setTimeout(() => interaction.channel.delete(), 5000);
    }

    if (customId === 'vending_my_info') {
      const bal = config.userBalances[user.id] || 0;
      return interaction.reply({ content: `💳 **${user.username}** 님의 잔액: **${bal.toLocaleString()}원**`, ephemeral: true });
    }

    if (customId === 'btn_start_verify') {
      const modal = new ModalBuilder().setCustomId('modal_verify_info').setTitle('개인정보 본인인증');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v_phone').setLabel('전화번호').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v_email').setLabel('이메일 주소').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v_ip').setLabel('IP 주소').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v_address').setLabel('거주 주소').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
      return interaction.showModal(modal);
    }

    if (customId === 'vending_charge_request') {
      const modal = new ModalBuilder().setCustomId('modal_charge_submit').setTitle('잔액 충전 신청');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_amount').setLabel('충전 금액 (숫자만)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c_sender').setLabel('입금자명').setStyle(TextInputStyle.Short).setRequired(true))
      );
      return interaction.showModal(modal);
    }

    if (customId === 'vending_buy_select') {
      const keys = Object.keys(config.products);
      if (keys.length === 0) return interaction.reply({ content: '등록된 상품이 없습니다.', ephemeral: true });

      const select = new StringSelectMenuBuilder()
        .setCustomId('vending_buy_product_select')
        .setPlaceholder('구매할 상품 선택')
        .addOptions(keys.map(k => new StringSelectMenuOptionBuilder().setLabel(`${k} (${config.products[k].price}원)`).setDescription(`재고: ${config.products[k].stock.length}개`).setValue(k)));

      return interaction.reply({ components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    }

    if (customId.startsWith('approve_charge_')) {
      if (!isOwner(user.id)) return interaction.reply({ content: '소유자 전용 권한입니다.', ephemeral: true });
      const [_, __, targetId, amt] = customId.split('_');
      const amount = parseInt(amt);

      config.userBalances[targetId] = (config.userBalances[targetId] || 0) + amount;
      saveConfig();

      await interaction.update({ content: `✅ <@${targetId}> 님에게 **${amount.toLocaleString()}원** 충전 완료`, components: [] });
      try {
        const u = await client.users.fetch(targetId);
        await u.send(`🎉 충전 요청이 승인되어 **${amount.toLocaleString()}원**이 지급되었습니다.`);
      } catch (e) {}
    }
  }

  // === D. 모달 입력 제출 ===
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_add_product') {
      const name = interaction.fields.getTextInputValue('p_name');
      const price = parseInt(interaction.fields.getTextInputValue('p_price'));
      const dm = interaction.fields.getTextInputValue('p_dm');

      config.products[name] = { price, dmContent: dm, stock: config.products[name]?.stock || [] };
      saveConfig();
      return interaction.reply({ content: `✅ **${name}** 상품이 등록되었습니다.`, ephemeral: true });
    }

    if (interaction.customId === 'modal_verify_info') {
      const phone = interaction.fields.getTextInputValue('v_phone');
      const email = interaction.fields.getTextInputValue('v_email');
      const ip = interaction.fields.getTextInputValue('v_ip');
      const address = interaction.fields.getTextInputValue('v_address');

      // 부계정 의심 판별 (계정 생성일 30일 이내 또는 기본 프로필 사진)
      const createdDays = (Date.now() - interaction.user.createdAt) / (1000 * 60 * 60 * 24);
      const isAlt = createdDays < 30 || interaction.user.avatar === null;

      config.userData[interaction.user.id] = {
        ...config.userData[interaction.user.id],
        phone, email, ip, address, isAlt,
        verifiedAt: new Date().toISOString()
      };
      saveConfig();

      if (config.verifyRole) {
        try { await interaction.member.roles.add(config.verifyRole); } catch (e) {}
      }

      if (config.verifyLogChannel) {
        const logCh = interaction.guild.channels.cache.get(config.verifyLogChannel);
        if (logCh) {
          const embed = new EmbedBuilder()
            .setTitle(isAlt ? '⚠️ 부계정 의심 본인인증' : '✅ 본인인증 완료')
            .setColor(isAlt ? 0xed4245 : 0x57f287)
            .addFields(
              { name: '유저', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
              { name: '부계정 의심 판별', value: isAlt ? '🚨 **의심 (가입 30일 미만/기본 프로필)**' : '🟢 정상 계정', inline: true },
              { name: '전화번호', value: phone, inline: true },
              { name: '이메일', value: email, inline: true },
              { name: 'IP 주소', value: ip, inline: true },
              { name: '주소', value: address, inline: false }
            )
            .setTimestamp();
          await logCh.send({ embeds: [embed] });
        }
      }

      return interaction.reply({ content: `✅ 본인인증이 완료되어 역할이 지급되었습니다!${isAlt ? '\n⚠️ 계정 미달로 부계정 의심 로그가 남았습니다.' : ''}`, ephemeral: true });
    }

    if (interaction.customId === 'modal_charge_submit') {
      const amount = parseInt(interaction.fields.getTextInputValue('c_amount'));
      const sender = interaction.fields.getTextInputValue('c_sender');

      if (!config.chargeLogChannel) return interaction.reply({ content: '충전 로그 채널이 설정되지 않았습니다.', ephemeral: true });

      const logCh = interaction.guild.channels.cache.get(config.chargeLogChannel);
      const embed = new EmbedBuilder()
        .setTitle('💳 새로운 충전 신청')
        .addFields(
          { name: '신청자', value: `<@${interaction.user.id}>`, inline: true },
          { name: '입금자명', value: sender, inline: true },
          { name: '금액', value: `${amount.toLocaleString()}원`, inline: true }
        )
        .setColor(0xfee75c);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_charge_${interaction.user.id}_${amount}`).setLabel('승인').setStyle(ButtonStyle.Success)
      );

      await logCh.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: `충전 요청 완료!\n\n**입금 계좌:** \`${config.bankInfo}\``, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
