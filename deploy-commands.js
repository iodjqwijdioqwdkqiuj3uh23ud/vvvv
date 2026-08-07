import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const commands = [
  // 1. 소유자 등록 (보안키)
  new SlashCommandBuilder()
    .setName('소유자등록')
    .setDescription('보안키를 입력하여 봇 소유자 권한을 획득합니다.')
    .addStringOption(opt => opt.setName('보안키').setDescription('소유자 인증 보안키').setRequired(true)),

  // 2. 채널 및 계좌 설정
  new SlashCommandBuilder()
    .setName('충전요청채널설정')
    .setDescription('[소유자전용] 충전 요청 로그 채널을 설정합니다.')
    .addChannelOption(opt => opt.setName('채널').setDescription('로그 채널').setRequired(true)),

  new SlashCommandBuilder()
    .setName('구매로그채널설정')
    .setDescription('[소유자전용] 구매 완료 로그 채널을 설정합니다.')
    .addChannelOption(opt => opt.setName('채널').setDescription('로그 채널').setRequired(true)),

  new SlashCommandBuilder()
    .setName('계좌등록')
    .setDescription('[소유자전용] 입금받을 계좌 정보를 설정합니다.')
    .addStringOption(opt => opt.setName('계좌정보').setDescription('예: OO은행 123-456-789 홍길동').setRequired(true)),

  new SlashCommandBuilder()
    .setName('티켓역할설정')
    .setDescription('[소유자전용] 티켓을 관리할 관리자 역할을 설정합니다.')
    .addRoleOption(opt => opt.setName('역할').setDescription('티켓 관리자 역할').setRequired(true)),

  // 3. 상품 관리
  new SlashCommandBuilder()
    .setName('상품추가')
    .setDescription('[소유자전용] 자판기에 새 상품을 추가합니다 (모달창 열림)'),

  new SlashCommandBuilder()
    .setName('상품재고추가')
    .setDescription('[소유자전용] 상품에 재고(코드/내용)를 추가합니다.')
    .addStringOption(opt => opt.setName('상품명').setDescription('재고를 추가할 상품 이름').setRequired(true))
    .addStringOption(opt => opt.setName('재고목록').setDescription('줄바꿈(엔터)으로 구별하여 입력').setRequired(true)),

  new SlashCommandBuilder()
    .setName('상품삭제')
    .setDescription('[소유자전용] 등록된 상품을 삭제합니다.')
    .addStringOption(opt => opt.setName('상품명').setDescription('삭제할 상품 이름').setRequired(true)),

  // 4. 패널 설치
  new SlashCommandBuilder()
    .setName('자판기패널')
    .setDescription('[소유자전용] 자판기 이용 패널을 설치합니다.'),

  new SlashCommandBuilder()
    .setName('티켓패널')
    .setDescription('[소유자전용] 카테고리 선택형 티켓 패널을 설치합니다.'),

  // 5. 기타 유저 명령어
  new SlashCommandBuilder()
    .setName('메시지')
    .setDescription('지정한 채널에 메시지를 보냅니다.')
    .addChannelOption(opt => opt.setName('채널').setDescription('메시지를 보낼 채널').setRequired(true))
    .addStringOption(opt => opt.setName('내용').setDescription('보낼 내용').setRequired(true)),

  new SlashCommandBuilder()
    .setName('dm공지')
    .setDescription('서버의 모든 멤버에게 DM으로 공지를 보냅니다.')
    .addStringOption(opt => opt.setName('내용').setDescription('공지할 내용').setRequired(true))
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
