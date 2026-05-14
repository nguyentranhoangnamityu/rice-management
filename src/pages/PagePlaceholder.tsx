type PagePlaceholderProps = {
  title: string;
  description: string;
};

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>

      <div className="empty-state">
        <strong>Chưa có chức năng nhập liệu.</strong>
        <span>Trang này đang sẵn sàng cho bước triển khai CRUD tiếp theo.</span>
      </div>
    </section>
  );
}
