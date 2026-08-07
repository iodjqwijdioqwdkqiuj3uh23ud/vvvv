import { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, 
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';
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

const dataDir = process.env.DATA_DIR || './';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const CONFIG_FILE = path.join(dataDir, 'vending_config.json');

// 기본 시스템 데이터 구조
let config = {
  owners: [], // 소유자 Discord User ID 목록
  ticketAdminRole: null,
  chargeLogChannel: null,
  buyLogChannel: null,
  bankInfo: '계좌 정보가 설정되지 않았습니다.',
  userBalances: {}, // { userId: balance }
  products: {} // { "상품명": { price: 1000, dmContent: "감사합니다", stock: ["코드1", "코드2"] } }
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const rawData = fs.readFileSync(CONFIG_FILE, 'utf-8');
    config = { ...config, ...JSON.parse(rawData) };
    console.log(`[데이터 로드 완료] 경로: ${CONFIG_FILE}`);
  } catch (err) {
    console.error('설정 파일 읽기 오류:', err);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('설정 파일 저장 오류:', err);
  }
}

// 소유자 권한 검증 함수
function isOwner(userId) {
  return config.owners.includes(userId);
}

client.once('clientReady', () => {
  console.log(`✅ 봇이 로그인되었습니다: ${client.user.tag}`);
});

// ---------------------------------------------------------
// 1. 슬래시 명령어 처리
// ---------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, user } = interaction;

  // ① 소유자 등록
  if (commandName === '소유자등록') {
    const key = options.getString('보안키');
    if (key === 'superkai333') {
      if (!config.owners.includes(user.id)) {
        config.owners.push(user.id);
        saveConfig();
        return interaction.reply({ content: '🎉 보안키 인증 성공! 소유자로 등록되었습니다.', ephemeral: true });
      }
      return interaction.reply({ content: '이미 소유자로 등록되어 있습니다.', ephemeral: true });
    } else {
      return interaction.reply({ content: '❌ 올바르지 않은 보안키입니다.', ephemeral: true });
    }
  }

  // --- 이하 관리자 명령어 (소유자 권한 체크) ---
  const ownerOnlyCommands = ['충전요청채널설정', '구매로그채널설정', '계좌등록', '티켓역할설정', '상품추가', '상품재고추가', '상품삭제', '자판기패널', '티켓패널', 'dm공지'];
  if (ownerOnlyCommands.includes(commandName) && !isOwner(user.id)) {
    return interaction.reply({ content: '❌ 이 명령어는 소유자 권한을 가진 사용자만 이용할 수 있습니다. (`/소유자등록`을 먼저 진행해 주세요)', ephemeral: true });
  }

  // ② 충전요청채널설정
  if (commandName === '충전요청채널설정') {
    const ch = options.getChannel('채널');
    config.chargeLogChannel = ch.id;
    saveConfig();
    return interaction.reply({ content: `충전 요청 로그 채널이 <#${ch.id}> 로 설정되었습니다.`, ephemeral: true });
  }

  // ③ 구매로그채널설정
  if (commandName === '구매로그채널설정') {
    const ch = options.getChannel('채널');
    config.buyLogChannel = ch.id;
    saveConfig();
    return interaction.reply({ content: `구매 로그 채널이 <#${ch.id}> 로 설정되었습니다.`, ephemeral: true });
  }

  // ④ 계좌등록
  if (commandName === '계좌등록') {
    const bank = options.getString('계좌정보');
    config.bankInfo = bank;
    saveConfig();
    return interaction.reply({ content: `입금 계좌 정보가 설정되었습니다:\n\`${bank}\``, ephemeral: true });
  }

  // ⑤ 티켓 역할 설정
  if (commandName === '티켓역할설정') {
    const role = options.getRole('역할');
    config.ticketAdminRole = role.id;
    saveConfig();
    return interaction.reply({ content: `티켓 관리자 역할이 <@&${role.id}> 로 지정되었습니다.`, ephemeral: true });
  }

  // ⑥ 상품추가 (모달 창 띄우기)
  if (commandName === '상품추가') {
    const modal = new ModalBuilder()
      .setCustomId('modal_add_product')
      .setTitle('새 상품 추가');

    const nameInput = new TextInputBuilder()
      .setCustomId('prod_name')
      .setLabel('상품 이름')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const priceInput = new TextInputBuilder()
      .setCustomId('prod_price')
      .setLabel('가격 (숫자만 입력)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const dmInput = new TextInputBuilder()
      .setCustomId('prod_dm')
      .setLabel('구매 성공 시 유저에게 DM으로 보낼 내용/설명')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(priceInput),
      new ActionRowBuilder().addComponents(dmInput)
    );

    return interaction.showModal(modal);
  }

  // ⑦ 상품 재고 추가
  if (commandName === '상품재고추가') {
    const name = options.getString('상품명');
    const stockRaw = options.getString('재고목록');

    if (!config.products[name]) {
      return interaction.reply({ content: `❌ '${name}' 상품을 찾을 수 없습니다. 상품명을 확인해 주세요.`, ephemeral: true });
    }

    const items = stockRaw.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    config.products[name].stock.push(...items);
    saveConfig();

    return interaction.reply({ content: `✅ **${name}** 상품에 재고 **${items.length}개**가 추가되었습니다. (현재 총 재고: ${config.products[name].stock.length}개)`, ephemeral: true });
  }

  // ⑧ 상품 삭제
  if (commandName === '상품삭제') {
    const name = options.getString('상품명');

    if (!config.products[name]) {
      return interaction.reply({ content: `❌ '${name}' 상품이 존재하지 않습니다.`, ephemeral: true });
    }

    delete config.products[name];
    saveConfig();
    return interaction.reply({ content: `🗑️ **${name}** 상품이 자판기에서 삭제되었습니다.`, ephemeral: true });
  }

  // ⑨ 자판기 패널 생성
  if (commandName === '자판기패널') {
    const embed = new EmbedBuilder()
      .setTitle('🛒 자판기 패널')
      .setDescription('아래 버튼을 사용하여 원하는 자판기 서비스를 이용해 보세요.')
      .setColor(0x57f287);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vending_buy_select').setLabel('상품 목록 및 구매').setStyle(ButtonStyle.Success).setEmoji('🛍️'),
      new ButtonBuilder().setCustomId('vending_charge_request').setLabel('잔액 충전').setStyle(ButtonStyle.Primary).setEmoji('💳'),
      new ButtonBuilder().setCustomId('vending_my_info').setLabel('내 정보 조회').setStyle(ButtonStyle.Secondary).setEmoji('👤')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '자판기 패널이 설치되었습니다.', ephemeral: true });
  }

  // ⑩ 꾸민 티켓 패널 생성 (이미지 스타일)
  if (commandName === '티켓패널') {
    const embed = new EmbedBuilder()
      .setTitle('🎟️ 티켓 생성')
      .setDescription('아래에서 원하시는 문의를 선택 후 티켓을 열어주세요 !')
      .setColor(0x2b2d31);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket_category_select')
      .setPlaceholder('🏷️ 티켓 문의 열기')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('구매 문의')
          .setDescription('구매를 원하시면 이 카테고리를 선택해주세요')
          .setValue('cat_buy')
          .setEmoji('💸'),
        new StringSelectMenuOptionBuilder()
          .setLabel('충전 문의')
          .setDescription('충전을 원하시면 이 카테고리를 선택해주세요')
          .setValue('cat_charge')
          .setEmoji('💳'),
        new StringSelectMenuOptionBuilder()
          .setLabel('장식 문의')
          .setDescription('장식 문의는 이 카테고리를 선택해주세요')
          .setValue('cat_decor')
          .setEmoji('🍥'),
        new StringSelectMenuOptionBuilder()
          .setLabel('기타 문의')
          .setDescription('기타 문의사항은 이 카테고리를 선택해주세요')
          .setValue('cat_etc')
          .setEmoji('🔮'),
        new StringSelectMenuOptionBuilder()
          .setLabel('섭부 문의')
          .setDescription('섭부 문의는 이 카테고리를 선택해주세요')
          .setValue('cat_partner')
          .setEmoji('⭐')
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '티켓 패널이 정상 설치되었습니다.', ephemeral: true });
  }

  // ⑪ DM 공지
  if (commandName === 'dm공지') {
    const content = options.getString('내용');
    await interaction.deferReply({ ephemeral: true });

    const members = await interaction.guild.members.fetch();
    let success = 0;
    for (const [_, m] of members) {
      if (m.user.bot) continue;
      try {
        await m.send(`**[${interaction.guild.name} 공지]**\n\n${content}`);
        success++;
      } catch (e) {}
    }
    return interaction.editReply(`총 ${success}명의 멤버에게 DM 공지를 전송했습니다.`);
  }

  // ⑫ 메시지
  if (commandName === '메시지') {
    const ch = options.getChannel('채널');
    const msg = options.getString('내용');
    await ch.send(msg);
    return interaction.reply({ content: '메시지가 전송되었습니다.', ephemeral: true });
  }
});

// ---------------------------------------------------------
// 2. 상호작용 (버튼, 메뉴 선택, 모달 제출) 처리
// ---------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  // === A. 티켓 카테고리 메뉴 선택 ===
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
    const categoryVal = interaction.values[0];
    const categoryNames = {
      'cat_buy': '구매-문의',
      'cat_charge': '충전-문의',
      'cat_decor': '장식-문의',
      'cat_etc': '기타-문의',
      'cat_partner': '섭부-문의'
    };

    const categoryTitle = categoryNames[categoryVal] || '문의';
    const ticketChannelName = `${categoryTitle}-${interaction.user.username}`;

    const existingChannel = interaction.guild.channels.cache.find(c => c.name === ticketChannelName);
    if (existingChannel) {
      return interaction.reply({ content: `이미 동일한 유형의 티켓 채널이 존재합니다: ${existingChannel}`, ephemeral: true });
    }

    const permissionOverwrites = [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
    ];

    if (config.ticketAdminRole) {
      permissionOverwrites.push({
        id: config.ticketAdminRole,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
      });
    }

    const ticketChannel = await interaction.guild.channels.create({
      name: ticketChannelName,
      type: ChannelType.GuildText,
      permissionOverwrites
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎫 ${categoryTitle.replace('-', ' ')} 티켓`)
      .setDescription(`안녕하세요 <@${interaction.user.id}>님!\n문의내용을 남겨주시면 담당 관리자가 확인 후 답변드립니다.`)
      .setColor(0x5865f2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('티켓 닫기').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('delete_ticket').setLabel('티켓 삭제').setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
    return interaction.reply({ content: `티켓이 성공적으로 생성되었습니다: ${ticketChannel}`, ephemeral: true });
  }

  // === B. 자판기 상품 구매 메뉴 선택 ===
  if (interaction.isStringSelectMenu() && interaction.customId === 'vending_buy_product_select') {
    const selectedProdName = interaction.values[0];
    const product = config.products[selectedProdName];

    if (!product) {
      return interaction.reply({ content: '존재하지 않는 상품입니다.', ephemeral: true });
    }

    const userBalance = config.userBalances[interaction.user.id] || 0;

    if (userBalance < product.price) {
      return interaction.reply({ content: `❌ 잔액이 부족합니다.\n* 상품 가격: **${product.price.toLocaleString()}원**\n* 보유 잔액: **${userBalance.toLocaleString()}원**`, ephemeral: true });
    }

    if (product.stock.length === 0) {
      return interaction.reply({ content: `❌ 현재 **${selectedProdName}** 상품의 재고가 없습니다. 관리자에게 문의하세요.`, ephemeral: true });
    }

    // 재고 지급 및 차감
    const deliveredItem = product.stock.shift();
    config.userBalances[interaction.user.id] -= product.price;
    saveConfig();

    // 구매자에게 DM으로 발송
    try {
      await interaction.user.send(`🎉 **${selectedProdName}** 구매가 완료되었습니다!\n\n**[지급 내용 / 코드]**\n\`\`\`\n${deliveredItem}\n\`\`\`\n* 추가 설명: ${product.dmContent}`);
    } catch (e) {
      return interaction.reply({ content: '❌ DM 수신이 차단되어 있습니다. DM을 연 후 다시 시도하세요.', ephemeral: true });
    }

    // 구매 로그 전송
    if (config.buyLogChannel) {
      const logCh = interaction.guild.channels.cache.get(config.buyLogChannel);
      if (logCh) {
        const logEmbed = new EmbedBuilder()
          .setTitle('🛍️ 상품 구매 완료 로그')
          .addFields(
            { name: '구매자', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
            { name: '상품명', value: selectedProdName, inline: true },
            { name: '결제 금액', value: `${product.price.toLocaleString()}원`, inline: true },
            { name: '남은 재고', value: `${product.stock.length}개`, inline: true }
          )
          .setColor(0x57f287)
          .setTimestamp();
        await logCh.send({ embeds: [logEmbed] });
      }
    }

    return interaction.reply({ content: `✅ **${selectedProdName}** 구매 성공! DM으로 내용이 발송되었습니다. (남은 잔액: ${config.userBalances[interaction.user.id].toLocaleString()}원)`, ephemeral: true });
  }

  // === C. 버튼 클릭 처리 ===
  if (interaction.isButton()) {
    const { customId, user } = interaction;

    // 티켓 닫기 / 삭제
    if (customId === 'close_ticket') {
      await interaction.reply('티켓이 닫힙니다.');
      await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
      return;
    }

    if (customId === 'delete_ticket') {
      await interaction.reply('5초 후 티켓 채널이 삭제됩니다...');
      setTimeout(() => interaction.channel.delete(), 5000);
      return;
    }

    // 자판기: 내 정보 조회
    if (customId === 'vending_my_info') {
      const balance = config.userBalances[user.id] || 0;
      return interaction.reply({ content: `💳 **${user.username}** 님의 보유 잔액: **${balance.toLocaleString()}원**`, ephemeral: true });
    }

    // 자판기: 충전 요청 모달
    if (customId === 'vending_charge_request') {
      const modal = new ModalBuilder()
        .setCustomId('modal_charge_submit')
        .setTitle('잔액 충전 신청');

      const amountInput = new TextInputBuilder()
        .setCustomId('charge_amount')
        .setLabel('충전할 금액 (숫자만)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const senderInput = new TextInputBuilder()
        .setCustomId('charge_sender')
        .setLabel('입금자명')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(amountInput),
        new ActionRowBuilder().addComponents(senderInput)
      );

      return interaction.showModal(modal);
    }

    // 자판기: 상품 구매 선택 드롭다운 생성
    if (customId === 'vending_buy_select') {
      const productKeys = Object.keys(config.products);
      if (productKeys.length === 0) {
        return interaction.reply({ content: '현재 등록된 상품이 없습니다.', ephemeral: true });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('vending_buy_product_select')
        .setPlaceholder('구매할 상품을 선택하세요')
        .addOptions(
          productKeys.map(key => {
            const prod = config.products[key];
            return new StringSelectMenuOptionBuilder()
              .setLabel(`${key} (${prod.price.toLocaleString()}원)`)
              .setDescription(`재고: ${prod.stock.length}개`)
              .setValue(key);
          })
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);
      return interaction.reply({ content: '아래 목록에서 구매할 상품을 선택하세요:', components: [row], ephemeral: true });
    }

    // 충전 요청 수락 버튼
    if (customId.startsWith('approve_charge_')) {
      if (!isOwner(user.id)) {
        return interaction.reply({ content: '❌ 소유자만 충전을 승인할 수 있습니다.', ephemeral: true });
      }

      const [_, __, targetUserId, amountStr] = customId.split('_');
      const amount = parseInt(amountStr);

      config.userBalances[targetUserId] = (config.userBalances[targetUserId] || 0) + amount;
      saveConfig();

      await interaction.update({ content: `✅ **충전 승인 완료**: <@${targetUserId}> 님에게 **${amount.toLocaleString()}원** 지급 완료 (처리자: <@${user.id}>)`, components: [] });

      try {
        const targetUser = await client.users.fetch(targetUserId);
        await targetUser.send(`🎉 충전 요청이 승인되어 **${amount.toLocaleString()}원**이 포인트로 추가되었습니다!`);
      } catch (e) {}
    }

    // 충전 요청 거절 버튼 (모달 열기)
    if (customId.startsWith('deny_charge_')) {
      if (!isOwner(user.id)) {
        return interaction.reply({ content: '❌ 소유자만 충전을 거절할 수 있습니다.', ephemeral: true });
      }

      const [_, __, targetUserId, amountStr] = customId.split('_');

      const modal = new ModalBuilder()
        .setCustomId(`modal_deny_reason_${targetUserId}_${amountStr}`)
        .setTitle('충전 거절 사유 입력');

      const reasonInput = new TextInputBuilder()
        .setCustomId('deny_reason')
        .setLabel('거절 사유')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      return interaction.showModal(modal);
    }
  }

  // === D. 모달 입력 제출 처리 ===
  if (interaction.isModalSubmit()) {
    // 상품 추가 모달 제출
    if (interaction.customId === 'modal_add_product') {
      const name = interaction.fields.getTextInputValue('prod_name');
      const price = parseInt(interaction.fields.getTextInputValue('prod_price'));
      const dm = interaction.fields.getTextInputValue('prod_dm');

      if (isNaN(price) || price < 0) {
        return interaction.reply({ content: '❌ 가격은 0 이상의 숫자여야 합니다.', ephemeral: true });
      }

      config.products[name] = {
        price,
        dmContent: dm,
        stock: config.products[name] ? config.products[name].stock : []
      };
      saveConfig();

      return interaction.reply({ content: `✅ **${name}** 상품이 추가/수정되었습니다. (가격: ${price.toLocaleString()}원)`, ephemeral: true });
    }

    // 충전 요청 모달 제출
    if (interaction.customId === 'modal_charge_submit') {
      const amount = parseInt(interaction.fields.getTextInputValue('charge_amount'));
      const sender = interaction.fields.getTextInputValue('charge_sender');

      if (isNaN(amount) || amount <= 0) {
        return interaction.reply({ content: '❌ 올바른 금액(숫자)을 입력해 주세요.', ephemeral: true });
      }

      if (!config.chargeLogChannel) {
        return interaction.reply({ content: '❌ 충전 요청 채널이 지정되지 않았습니다. 관리자에게 문의하세요.', ephemeral: true });
      }

      const logCh = interaction.guild.channels.cache.get(config.chargeLogChannel);
      if (!logCh) {
        return interaction.reply({ content: '❌ 지정된 충전 요청 채널을 찾을 수 없습니다.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('💳 새로운 충전 신청')
        .addFields(
          { name: '신청자', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
          { name: '입금자명', value: sender, inline: true },
          { name: '신청 금액', value: `${amount.toLocaleString()}원`, inline: true }
        )
        .setColor(0xfee75c)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_charge_${interaction.user.id}_${amount}`).setLabel('승인').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`deny_charge_${interaction.user.id}_${amount}`).setLabel('거절').setStyle(ButtonStyle.Danger)
      );

      await logCh.send({ embeds: [embed], components: [row] });

      return interaction.reply({
        content: `충전 신청이 완료되었습니다.\n\n**입금 계좌:** \`${config.bankInfo}\`\n입금 확인 후 소유자 승인 시 포인트가 지급됩니다.`,
        ephemeral: true
      });
    }

    // 거절 사유 모달 제출
    if (interaction.customId.startsWith('modal_deny_reason_')) {
      const [_, __, ___, targetUserId, amountStr] = interaction.customId.split('_');
      const reason = interaction.fields.getTextInputValue('deny_reason');

      await interaction.update({ content: `❌ **충전 거절됨**: <@${targetUserId}> 님의 ${parseInt(amountStr).toLocaleString()}원 충전 거절 (사유: ${reason})`, components: [] });

      try {
        const targetUser = await client.users.fetch(targetUserId);
        await targetUser.send(`❌ 충전 신청이 거절되었습니다.\n* 신청 금액: ${parseInt(amountStr).toLocaleString()}원\n* 거절 사유: ${reason}`);
      } catch (e) {}
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
