interface AppSectionPageProps {
  title: string;
}

export function AppSectionPage({ title }: AppSectionPageProps) {
  return (
    <section aria-labelledby="app-section-title">
      <h1 id="app-section-title">{title}</h1>
      <p>Esta sección se implementará en su historia correspondiente.</p>
    </section>
  );
}
