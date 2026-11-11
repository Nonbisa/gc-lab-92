export type ToolStatus = 'live' | 'wait';

export interface ToolItem {
  title: string;
  description: string;
  icon: string;
  href?: string;
  status: string;
  statusType: ToolStatus;
  message?: string;
}

export const tools: ToolItem[] = [
  {
    title: '초과근무 검증',
    description: '지급자료 비교 · 오류 확인 · 결과 다운로드',
    icon: '⏱️',
    status: '준비 중',
    statusType: 'wait',
    message: '초과근무 검증기는 연결 준비 중입니다.',
  },
  {
    title: '출장여비 검증',
    description: '중복 지급 · 시간 오류 · 여비 산정 점검',
    icon: '🚕',
    href: 'tools/travel/',
    status: '사용 가능',
    statusType: 'live',
  },
  {
    title: '금천한끼',
    description: '오늘 점심 뭐먹지?',
    icon: '🍚',
    href: 'tools/lunch/',
    status: '사용 가능',
    statusType: 'live',
  },
  {
    title: '연가보상비 계산기',
    description: '직급·호봉으로 예상 지급액 계산',
    icon: '💰',
    href: 'tools/leave/',
    status: '사용 가능',
    statusType: 'live',
  },
  {
    title: 'QR코드 생성기',
    description: 'url 주소를 QR 이미지로 생성, 복사·다운로드',
    icon: '▦',
    href: 'tools/qr/',
    status: '사용 가능',
    statusType: 'live',
  },
  {
    title: '중간지문 점검',
    description: '주말 출퇴근시간과 지문인식 내역 비교',
    icon: '☝️',
    href: 'tools/fingerprint/',
    status: '실험 중',
    statusType: 'live',
  },
  {
    title: '방명록',
    description: '닉네임으로 짧은 글과 비밀글 남기기',
    icon: '✎',
    href: 'guestbook/',
    status: '사용 가능',
    statusType: 'live',
  },
  {
    title: '복무점검',
    description: '연가·휴가 집계 · 육아시간 중복 점검',
    icon: '📅',
    href: 'tools/bokmoo/',
    status: '사용 가능',
    statusType: 'live',
  },
];
