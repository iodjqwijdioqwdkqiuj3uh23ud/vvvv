import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const commands = [
  // 1. 소유자 및 기기 설정
  new SlashCommandBuilder()
    .setName('소유자등록')
    .setDescription('보안키를 입력하여 소유자 권한을 획득합니다.')
    .addStringOption(opt => opt.setName('보안키').setDescription('보안키').setRequired(true)),

  new SlashCommandBuilder()
    .setName('인증역할설정')
    .setDescription('[소유자전용] 본인인증 성공 시 지급할 역할을 설정합니다.')
    .addRoleOption(opt => opt.setName('역할').setDescription('지급할 역할').setRequired(true)),

  new SlashCommandBuilder()
    .setName('인증로그채널설정')
    .setDescription('[소유자전용] 인증 및 부계정 의심 로그 채널을 설정합니다.')
    .addChannelOption(opt => opt.setName('채널').setDescription('로그 채널').setRequired(true)),

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
    .setDescription('[소유자전용] 입금 계좌를 설정합니다.')
    .addStringOption(opt => opt.setName('계좌정보').setDescription('계좌 정보').setRequired(true)),

  new SlashCommandBuilder()
    .setName('티켓역할설정')
    .setDescription('[소유자전용] 티켓 관리자 역할을 설정합니다.')
    .addRoleOption(opt => opt.setName('역할').setDescription('티켓 관리자 역할').setRequired(true)),

  // 2. 상품 및 재고 관리
  new SlashCommandBuilder()
    .setName('상품추가')
    .setDescription('[소유자전용] 모달창을 통해 새 상품을 등록합니다.'),

  new SlashCommandBuilder()
    .setName('상품재고추가')
    .setDescription('[소유자전용] 줄바꿈 단위로 재고를 추가합니다.')
    .addStringOption(opt => opt.setName('상품명').setDescription('상품 이름').setRequired(true))
    .addStringOption(opt => opt.setName('재고목록').setDescription('줄바꿈으로 구분된 재고 목록').setRequired(true)),

  new SlashCommandBuilder()
    .setName('상품삭제')
    .setDescription('[소유자전용] 상품을 삭제합니다.')
    .addStringOption(opt => opt.setName('상품명').setDescription('삭제할 상품명').setRequired(true)),

  // 3. 패널 설치
  new SlashCommandBuilder()
    .setName('자판기패널')
    .setDescription('[소유자전용] 자판기 이용 패널을 설치합니다.'),

  new SlashCommandBuilder()
    .setName('인증패널')
    .setDescription('[소유자전용] 본인인증(개인정보) 패널을 설치합니다.'),

  new SlashCommandBuilder()
    .setName('티켓패널')
    .setDescription('[소유자전용] 카테고리 선택형 티켓 패널을 설치합니다.'),

  // 4. 복구 / 서버 관리 및 유저 기능
  new SlashCommandBuilder()
    .setName('유저서버조회')
    .setDescription('[소유자전용] 특정 유저가 가입된 서버 목록을 확인합니다.')
    .addUserOption(opt => opt.setName('유저').setDescription('조회할 유저').setRequired(true)),

  new SlashCommandBuilder()
    .setName('서버강제참가')
    .setDescription('[소유자전용] 복구키(OAuth)로 등록된 유저를 현재 서버로 강제 참여시킵니다.')
    .addUserOption(opt => opt.setName('유저').setDescription('참여시킬 유저').setRequired(true)),

  new SlashCommandBuilder()
    .setName('dm공지')
    .setDescription('[소유자전용] 서버 전체 인원에게 DM 공지를 전송합니다.')
    .addStringOption(opt => opt.setName('내용').setDescription('공지 내용').setRequired(true)),

  new SlashCommandBuilder()
    .setName('메시지')
    .setDescription('특정 채널에 메시지를 작성합니다.')
    .addChannelOption(opt => opt.setName('채널').setDescription('메시지를 보낼 채널').setRequired(true))
    .addStringOption(opt => opt.setName('내용').setDescription('메시지 내용').setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔄 슬래시 명령어 등록 중...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ 모든 통합 슬래시 명령어 등록 완료!');
  } catch (error) {
    console.error('❌ 명령어 등록 실패:', error);
  }
})();
