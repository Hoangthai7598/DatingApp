import Invite from "@/components/Invite";
import Mascot from "@/components/Mascot";

export default function Page() {
  return (
    <>
      <header className="top">
        <Mascot mood="happy" size={88} className="hello" />
        <h1>Hôm nào rảnh, đi chơi với anh nhé?</h1>
        <p>Em chọn đi đâu, hôm nào, mấy giờ — anh lo phần còn lại.</p>
      </header>
      <Invite />
      <p className="foot">Anh Thái gửi em</p>
    </>
  );
}
