import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName('메시지')
    .setDescription('지정한 채널에 메시지를 보냅니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(opt => opt.setName('채널').setDescription('메시지를 보낼 채널').setRequired(true))
    .addStringOption(opt => opt.setName('내용').setDescription('보낼 내용').setRequired(true)),

  new SlashCommandBuilder()
    .setName('dm공지')
    .setDescription('서버의 모든 멤버에게 DM으로 공지를 보냅니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt => opt.setName('내용').setDescription('공지할 내용').setRequired(true)),

  new SlashCommandBuilder()
    .setName('티켓역할설정')
    .setDescription('티켓을 관리할 관리자 역할을 설정합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(opt => opt.setName('역할').setDescription('티켓 관리자 역할').setRequired(true)),

  new SlashCommandBuilder()
    .setName('티켓패널')
    .setDescription('티켓 생성 패널을 설치합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('충전로그채널설정')
    .setDescription('충전 요청 및 승인 로그가 출력될 채널을 설정합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(opt => opt.setName('채널').setDescription('로그 채널').setRequired(true)),

  new SlashCommandBuilder()
    .setName('충전계좌설정')
    .setDescription('자판기 입금 계좌 정보를 설정합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt => opt.setName('계좌정보').setDescription('예: OO은행 123-456-789 홍길동').setRequired(true)),

  new SlashCommandBuilder()
    .setName('자판기패널')
    .setDescription('자판기 이용 패널을 설치합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔄 슬래시 명령어 등록 중...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ 슬래시 명령어 등록 완료!');
  } catch (error) {
    console.error('❌ 명령어 등록 실패:', error);
  }
})();
