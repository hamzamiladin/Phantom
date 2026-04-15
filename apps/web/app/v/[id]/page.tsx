import { ViewerClient } from "./ViewerClient";

interface ViewerPageProps {
  params: Promise<{ id: string }>;
}

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { id } = await params;

  return <ViewerClient jobId={id} />;
}
