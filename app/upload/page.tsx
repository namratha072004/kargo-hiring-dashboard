import { Uploader } from "../components";

export default function UploadPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>⬆️ Upload CVs</h1>
          <p>Drop them in. Each one is scored against both rubrics, gets a draft email, and the top ones get an interview brief.</p>
        </div>
      </div>
      <Uploader />
    </>
  );
}
