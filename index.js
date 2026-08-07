import { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, 
  ModalBuilder, TextInputBuilder, TextInputStyle 
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// 1. 디스코드 클라이언트 설정
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 2. 클라우드타입 볼륨 마운트 호환 데이터 경로 설정
const dataDir = process.env.DATA_DIR || './';

// 데이터 폴더가 없을 경우 자동 생성
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const CONFIG_FILE = path.join(dataDir, 'config.json');

// 기본 설정 데이터 구조
let config = {
  ticketAdminRole: null,
  chargeLogChannel: null,
  bankInfo: '계좌 정보가 설정되지 않았습니다.',
  userBalances: {}, // { userId: balance }
};

// 기존 데이터 로드
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const rawData = fs.readFileSync(CONFIG_FILE, 'utf-8');
    config = { ...config, ...JSON.parse(rawData) };
    console.log(`[데이터 로드 완료] 경로: ${CONFIG_FILE}`);
  } catch (err) {
    console.error('config.json 읽기 오류:', err);
  }
}

// 데이터 저장 함수
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('config.json 저장 오류:', err);
  }
}

client.once('ready', () => {
  console.log(`✅ 봇이 정상적으로 로그인되었습니다: ${client.user.tag}`);
});

// ---------------------------------------------------------
// 3. 슬래시 명령어 처리 (ChatInputCommand)
// ---------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  // ① 메시지 보내기
  if (commandName === '메시지') {
    const targetChannel = options.getChannel('채널');
    const content = options.getString('내용');
    await targetChannel.send(content);
    return interaction.reply({ content: '메시지가 성공적으로 전송되었습니다.', ephemeral: true });
  }

  // ② DM 전체 공지
  if (commandName === 'dm공지') {
    const content = options.getString('내용');
    await interaction.deferReply({ ephemeral: true });

    const members = await interaction.guild.members.fetch();
    let successCount = 0;

    for (const [_, member] of members) {
      if (member.user.bot) continue;
      try {
        await member.send(`**[${interaction.guild.name} 공지]**\n\n${content}`);
        successCount++;
      } catch (err) {
        // 유저가 DM 수신을 거부한 경우 예외 처리
      }
    }
    return interaction.editReply(`총 ${successCount}명에게 DM 공지를 전송했습니다.`);
  }

  // ③ 티켓 볼 수 있는 역할 설정
  if (commandName === '티켓역할설정') {
    const role = options.getRole('역할');
    config.ticketAdminRole = role.id;
    saveConfig();
    return interaction.reply({ content: `티켓 관리 역할이 <@&${role.id}> 로 설정되었습니다.`, ephemeral: true });
  }

  // ④ 티켓 패널 생성
  if (commandName === '티켓패널') {
    const embed = new EmbedBuilder()
      .setTitle('🎫 고객지원 티켓')
      .setDescription('문의사항이 있으시면 아래 버튼을 눌러 티켓을 생성해 주세요.')
      .setColor(0x00aae4);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('티켓 생성')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📩')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '티켓 패널이 생성되었습니다.', ephemeral: true });
  }

  // ⑤ 자판기 충전로그 채널 설정
  if (commandName === '충전로그채널설정') {
    const channel = options.getChannel('채널');
    config.chargeLogChannel = channel.id;
    saveConfig();
    return interaction.reply({ content: `충전 로그 채널이 <#${channel.id}> 로 설정되었습니다.`, ephemeral: true });
  }

  // ⑥ 자판기 충전계좌 설정
  if (commandName === '충전계좌설정') {
    const bankInfo = options.getString('계좌정보');
    config.bankInfo = bankInfo;
    saveConfig();
    return interaction.reply({ content: `충전 계좌가 변경되었습니다:\n\`${bankInfo}\``, ephemeral: true });
  }

  // ⑦ 자판기 패널 생성
  if (commandName === '자판기패널') {
    const embed = new EmbedBuilder()
      .setTitle('🛒 자판기 이용 패널')
      .setDescription('원하시는 항목의 버튼을 선택해 주세요.')
      .setColor(0x57f287);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vending_buy').setLabel('상품 구매').setStyle(ButtonStyle.Success).setEmoji('🛍️'),
      new ButtonBuilder().setCustomId('vending_charge').setLabel('잔액 충전').setStyle(ButtonStyle.Primary).setEmoji('💳'),
      new ButtonBuilder().setCustomId('vending_info').setLabel('내 정보 조회').setStyle(ButtonStyle.Secondary).setEmoji('👤')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '자판기 패널이 생성되었습니다.', ephemeral: true });
  }
});

// ---------------------------------------------------------
// 4. 버튼 및 모달 클릭 처리 (Button & ModalSubmit)
// ---------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  // --- 버튼 클릭 처리 ---
  if (interaction.isButton()) {
    const { customId, guild, member, channel } = interaction;

    // A. 티켓 생성
    if (customId === 'create_ticket') {
      const ticketName = `ticket-${member.user.username}`;
      const existingChannel = guild.channels.cache.find(c => c.name === ticketName);
      if (existingChannel) {
        return interaction.reply({ content: '이미 생성된 티켓 채널이 있습니다.', ephemeral: true });
      }

      const permissionOverwrites = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ];

      if (config.ticketAdminRole) {
        permissionOverwrites.push({
          id: config.ticketAdminRole,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
        });
      }

      const ticketChannel = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        permissionOverwrites
      });

      const embed = new EmbedBuilder()
        .setTitle('🎟️ 티켓이 생성되었습니다')
        .setDescription('문의사항을 남겨주시면 관리자가 확인 후 답변드립니다.')
        .setColor(0x57f287);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('티켓 닫기').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('delete_ticket').setLabel('티켓 삭제').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `<@${member.id}>님 반갑습니다.`, embeds: [embed], components: [row] });
      return interaction.reply({ content: `티켓이 생성되었습니다: ${ticketChannel}`, ephemeral: true });
    }

    // B. 티켓 닫기 (티켓 연 사용자의 보기 권한 제거)
    if (customId === 'close_ticket') {
      const channelName = channel.name;
      const username = channelName.replace('ticket-', '');
      const ticketOwner = guild.members.cache.find(m => m.user.username === username);

      if (ticketOwner) {
        await channel.permissionOverwrites.edit(ticketOwner.id, {
          ViewChannel: false
        });
      }

      return interaction.reply({ content: '티켓이 닫혔습니다. (티켓 생성자의 보기 권한이 제거되었습니다.)' });
    }

    // C. 티켓 삭제
    if (customId === 'delete_ticket') {
      await interaction.reply('5초 후 티켓 채널을 삭제합니다...');
      setTimeout(() => channel.delete(), 5000);
      return;
    }

    // D. 자판기: 내 정보 조회
    if (customId === 'vending_info') {
      const balance = config.userBalances[member.id] || 0;
      return interaction.reply({ content: `💳 **${member.user.username}** 님의 보유 잔액: **${balance.toLocaleString()}원**`, ephemeral: true });
    }

    // E. 자판기: 충전 요청 모달 띄우기
    if (customId === 'vending_charge') {
      const modal = new ModalBuilder()
        .setCustomId('modal_charge_request')
        .setTitle('자판기 포인트 충전 요청');

      const amountInput = new TextInputBuilder()
        .setCustomId('charge_amount')
        .setLabel('충전할 금액 (숫자만 입력)')
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

    // F. 자판기: 상품 구매 (기본 예시)
    if (customId === 'vending_buy') {
      const price = 1000; // 상품 가격 설정
      const userBalance = config.userBalances[member.id] || 0;

      if (userBalance < price) {
        return interaction.reply({ content: `잔액이 부족합니다. (필요 금액: ${price.toLocaleString()}원 / 보유 금액: ${userBalance.toLocaleString()}원)`, ephemeral: true });
      }

      config.userBalances[member.id] -= price;
      saveConfig();

      return interaction.reply({ content: `🎉 구매가 완료되었습니다! 1,000원이 차감되었습니다. (남은 잔액: ${config.userBalances[member.id].toLocaleString()}원)`, ephemeral: true });
    }

    // G. 관리자 충전 승인 버튼 클릭
    if (customId.startsWith('approve_charge_')) {
      const [_, __, targetUserId, amountStr] = customId.split('_');
      const amount = parseInt(amountStr);

      config.userBalances[targetUserId] = (config.userBalances[targetUserId] || 0) + amount;
      saveConfig();

      await interaction.update({ content: `✅ **승인됨**: <@${targetUserId}> 님에게 **${amount.toLocaleString()}원** 충전 완료`, components: [] });
      
      // 유저에게 DM 안내
      try {
        const targetMember = await guild.members.fetch(targetUserId);
        await targetMember.send(`🎉 충전 요청이 승인되어 **${amount.toLocaleString()}원**이 지급되었습니다!`);
      } catch (err) {}
    }
  }

  // --- 모달 입력 제출 처리 ---
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_charge_request') {
      const amount = parseInt(interaction.fields.getTextInputValue('charge_amount'));
      const sender = interaction.fields.getTextInputValue('charge_sender');

      if (isNaN(amount) || amount <= 0) {
        return interaction.reply({ content: '올바른 금액(숫자)을 입력해 주세요.', ephemeral: true });
      }

      if (!config.chargeLogChannel) {
        return interaction.reply({ content: '충전 로그 채널이 설정되지 않았습니다. 관리자에게 문의하세요.', ephemeral: true });
      }

      const logChannel = interaction.guild.channels.cache.get(config.chargeLogChannel);

      const embed = new EmbedBuilder()
        .setTitle('💳 새로운 충전 요청')
        .addFields(
          { name: '요청자', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
          { name: '입금자명', value: sender, inline: true },
          { name: '신청 금액', value: `${amount.toLocaleString()}원`, inline: true }
        )
        .setColor(0xfee75c)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_charge_${interaction.user.id}_${amount}`)
          .setLabel('충전 승인하기')
          .setStyle(ButtonStyle.Success)
      );

      await logChannel.send({ embeds: [embed], components: [row] });

      return interaction.reply({
        content: `충전 요청이 접수되었습니다.\n\n**입금 계좌:** \`${config.bankInfo}\`\n입금 확인 후 관리자가 승인하면 포인트가 자동 지급됩니다.`,
        ephemeral: true
      });
    }
  }
});

// 봇 로그인
client.login(process.env.DISCORD_TOKEN);
