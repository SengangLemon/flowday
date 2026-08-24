import type { Metadata } from 'next';
import { LegalPage } from '../components/legal-page';

export const metadata: Metadata = {
  title: '이용약관 | Flowday',
  description: 'Flowday 서비스 이용에 적용되는 기본 조건을 안내합니다.',
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Flowday 이용약관"
      lead="이 약관은 Flowday의 계정, 계획 동기화와 생활 관리 기능을 이용할 때 적용됩니다."
      updatedAt="2026년 8월 24일"
    >
      <section>
        <h2>1. 서비스</h2>
        <p>Flowday는 할 일, 습관, 장단기 목표, 일정과 집중 기록을 작성하고 계정에 동기화할 수 있는 생활 관리 서비스를 제공합니다. 기능은 안정성과 사용성을 개선하기 위해 변경될 수 있습니다.</p>
      </section>
      <section>
        <h2>2. 계정 관리</h2>
        <p>사용자는 정확한 이메일 주소를 사용하고 계정 접근 정보를 안전하게 관리해야 합니다. 비정상적인 접근이 의심되면 즉시 비밀번호를 변경하고 고객지원에 알려주세요.</p>
      </section>
      <section>
        <h2>3. 사용자 데이터</h2>
        <p>사용자가 작성한 계획과 기록의 권리는 사용자에게 있습니다. Flowday는 서비스 제공, 동기화, 보안과 복구에 필요한 범위에서만 해당 데이터를 처리합니다.</p>
      </section>
      <section>
        <h2>4. 올바른 이용</h2>
        <p>서비스를 침해하거나 다른 사용자의 계정에 접근하는 행위, 자동화된 과도한 요청으로 운영을 방해하는 행위, 관련 법령을 위반하는 행위를 해서는 안 됩니다.</p>
      </section>
      <section>
        <h2>5. 가용성과 책임</h2>
        <p>Flowday는 안정적인 서비스를 위해 노력하지만 네트워크, 외부 인프라 또는 점검으로 일시적인 중단이 발생할 수 있습니다. 중요한 기록은 앱의 백업 내보내기 기능으로 별도 보관할 것을 권장합니다.</p>
      </section>
      <section>
        <h2>6. 계정 종료</h2>
        <p>사용자는 언제든 앱 설정에서 계정 삭제를 요청할 수 있습니다. 계정 삭제가 완료되면 연결된 계획 데이터는 개인정보처리방침에 따라 처리됩니다.</p>
      </section>
      <section>
        <h2>7. 약관 변경과 문의</h2>
        <p>중요한 변경이 있는 경우 서비스 내 적절한 방법으로 안내합니다. 약관 관련 문의는 <a href="mailto:sunghyun329@gmail.com">sunghyun329@gmail.com</a>으로 보내주세요.</p>
      </section>
    </LegalPage>
  );
}
