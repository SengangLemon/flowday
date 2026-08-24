import type { Metadata } from 'next';
import { LegalPage } from '../components/legal-page';

export const metadata: Metadata = {
  title: '고객지원 | Flowday',
  description: 'Flowday 이용과 계정, 동기화에 관한 도움을 받을 수 있습니다.',
};

export default function SupportPage() {
  return (
    <LegalPage
      eyebrow="Support"
      title="Flowday 고객지원"
      lead="계획과 기록을 잃지 않고 Flowday를 편하게 사용할 수 있도록 도와드리겠습니다."
      updatedAt="2026년 8월 24일"
    >
      <section className="support-contact">
        <h2>이메일 문의</h2>
        <p>문제 상황, 사용 기기와 브라우저 또는 앱 버전을 함께 적어주시면 더 빠르게 확인할 수 있습니다.</p>
        <a className="legal-primary-link" href="mailto:sunghyun329@gmail.com?subject=Flowday%20고객지원%20문의">sunghyun329@gmail.com</a>
      </section>

      <section>
        <h2>자주 묻는 질문</h2>
        <h3>계획이 다른 기기에 보이지 않아요.</h3>
        <p>두 기기에서 같은 이메일 계정으로 로그인했는지 확인한 뒤, 설정과 데이터의 동기화 상태가 ‘모든 기기와 동기화됨’인지 확인해주세요.</p>
        <h3>데이터를 따로 보관할 수 있나요?</h3>
        <p>설정과 데이터 → 데이터 백업 → 백업 내보내기에서 전체 계획을 JSON 파일로 저장할 수 있습니다.</p>
        <h3>계정을 완전히 삭제하고 싶어요.</h3>
        <p>설정과 데이터 → 계정 삭제에서 삭제할 수 있습니다. 계정과 연결된 계획 및 완료 기록이 함께 삭제되며 되돌릴 수 없습니다.</p>
      </section>

      <section>
        <h2>서비스 상태와 보안</h2>
        <p>장애나 보안 문제가 의심되면 계정 이메일, 비밀번호 또는 전체 백업 파일을 보내지 말고 발생 시각과 화면에 표시된 오류만 알려주세요.</p>
      </section>
    </LegalPage>
  );
}
