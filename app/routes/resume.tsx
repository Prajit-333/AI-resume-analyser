import {Link, useNavigate, useParams} from "react-router";
import {useEffect, useState} from "react";
import {usePuterStore} from "~/lib/puter";
import Summary from "~/components/Summary";
import ATS from "~/components/ATS";
import Details from "~/components/Details";

export const meta = () => ([
    { title: 'Resumind | Review ' },
    { name: 'description', content: 'Detailed overview of your resume' },
])

const Resume = () => {
    const { auth, isLoading, fs, kv } = usePuterStore();
    const { id } = useParams();
    const [imageUrl, setImageUrl] = useState('');
    const [resumeUrl, setResumeUrl] = useState('');
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [loadingError, setLoadingError] = useState<string | null>(null);
    const [isLoadingResume, setIsLoadingResume] = useState(true);
    const [analysisStatus, setAnalysisStatus] = useState<string>('loading');
    const navigate = useNavigate();

    useEffect(() => {
        if(!isLoading && !auth.isAuthenticated) navigate(`/auth?next=/resume/${id}`);
    }, [isLoading])

    useEffect(() => {
        const loadResume = async () => {
            try {
                setIsLoadingResume(true);
                setLoadingError(null);
                console.log('Loading resume with ID:', id);

                const resume = await kv.get(`resume:${id}`);
                console.log('Resume data from KV:', resume);

                if(!resume) {
                    setLoadingError('Resume not found');
                    setIsLoadingResume(false);
                    return;
                }

                const data = JSON.parse(resume);
                console.log('Parsed resume data:', data);

                const resumeBlob = await fs.read(data.resumePath);
                if(!resumeBlob) {
                    console.error('Failed to read resume file');
                    setLoadingError('Failed to load resume file');
                    setIsLoadingResume(false);
                    return;
                }

                const pdfBlob = new Blob([resumeBlob], { type: 'application/pdf' });
                const resumeUrl = URL.createObjectURL(pdfBlob);
                setResumeUrl(resumeUrl);
                console.log('Resume URL created:', resumeUrl);

                const imageBlob = await fs.read(data.imagePath);
                if(!imageBlob) {
                    console.error('Failed to read image file');
                    setLoadingError('Failed to load resume image');
                    setIsLoadingResume(false);
                    return;
                }
                const imageUrl = URL.createObjectURL(imageBlob);
                setImageUrl(imageUrl);
                console.log('Image URL created:', imageUrl);

                // Check if feedback exists and is valid
                if (data.status === 'analyzing') {
                    console.log('Analysis still in progress, will poll for updates');
                    setAnalysisStatus('analyzing');
                    setIsLoadingResume(false);
                    return;
                } else if (data.status === 'failed') {
                    console.error('Analysis failed:', data.feedback);
                    setAnalysisStatus('failed');
                    // Check if feedback has error details
                    if (data.feedback?.error) {
                        setLoadingError(`Analysis failed: ${data.feedback.error}`);
                    } else {
                        setLoadingError('Resume analysis failed. Please try uploading again.');
                    }
                    setIsLoadingResume(false);
                    return;
                } else if (data.feedback && typeof data.feedback === 'object' && !('error' in data.feedback)) {
                    console.log('Setting feedback:', data.feedback);
                    setFeedback(data.feedback);
                    setAnalysisStatus('completed');
                } else {
                    console.warn('Feedback is missing or invalid:', data.feedback);
                    setAnalysisStatus('pending');
                    setLoadingError('Resume analysis is pending. Please wait...');
                }
                
                setIsLoadingResume(false);
            } catch (error) {
                console.error('Error loading resume:', error);
                setLoadingError(`Error: ${error instanceof Error ? error.message : 'Failed to load resume'}`);
                setIsLoadingResume(false);
            }
        }

        if (id && auth.isAuthenticated) {
            loadResume();
        }
    }, [id, auth.isAuthenticated]);

    // Poll for updates when analysis is in progress
    useEffect(() => {
        if (analysisStatus !== 'analyzing') return;

        const pollInterval = setInterval(async () => {
            console.log('Polling for analysis updates...');
            try {
                const resume = await kv.get(`resume:${id}`);
                if (!resume) return;
                
                const data = JSON.parse(resume);
                console.log('Poll result - status:', data.status, 'feedback:', data.feedback);
                
                if (data.status === 'completed' && data.feedback && !('error' in data.feedback)) {
                    console.log('Analysis completed, updating feedback');
                    setFeedback(data.feedback);
                    setAnalysisStatus('completed');
                    setLoadingError(null);
                    clearInterval(pollInterval);
                } else if (data.status === 'failed') {
                    console.log('Analysis failed:', data.feedback);
                    setAnalysisStatus('failed');
                    if (data.feedback?.error) {
                        setLoadingError(`Analysis failed: ${data.feedback.error}`);
                    } else {
                        setLoadingError('Resume analysis failed. Please try uploading again.');
                    }
                    clearInterval(pollInterval);
                } else if (data.feedback?.error) {
                    console.log('Feedback has error:', data.feedback.error);
                    setAnalysisStatus('failed');
                    setLoadingError(`Analysis error: ${data.feedback.error}`);
                    clearInterval(pollInterval);
                }
            } catch (error) {
                console.error('Error polling for updates:', error);
            }
        }, 3000); // Poll every 3 seconds

        // Clear interval after 2 minutes
        setTimeout(() => {
            clearInterval(pollInterval);
            if (analysisStatus === 'analyzing') {
                setLoadingError('Analysis is taking longer than expected. Please refresh the page.');
                setAnalysisStatus('timeout');
            }
        }, 120000);

        return () => clearInterval(pollInterval);
    }, [analysisStatus, id, kv]);

    return (
        <main className="!pt-0">
            <nav className="resume-nav">
                <Link to="/" className="back-button">
                    <img src="/icons/back.svg" alt="logo" className="w-2.5 h-2.5" />
                    <span className="text-gray-800 text-sm font-semibold">Back to Homepage</span>
                </Link>
            </nav>
            <div className="flex flex-row w-full max-lg:flex-col-reverse">
                <section className="feedback-section bg-[url('/images/bg-small.svg') bg-cover h-[100vh] sticky top-0 items-center justify-center">
                    {imageUrl && resumeUrl && (
                        <div className="animate-in fade-in duration-1000 gradient-border max-sm:m-0 h-[90%] max-wxl:h-fit w-fit">
                            <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                    src={imageUrl}
                                    className="w-full h-full object-contain rounded-2xl"
                                    title="resume"
                                />
                            </a>
                        </div>
                    )}
                </section>
                <section className="feedback-section">
                    <h2 className="text-4xl !text-black font-bold">Resume Review</h2>
                    {loadingError ? (
                        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 my-4" role="alert">
                            <p className="font-bold">Loading Issue</p>
                            <p>{loadingError}</p>
                            <button 
                                onClick={() => window.location.reload()} 
                                className="mt-2 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                            >
                                Refresh Page
                            </button>
                            {/* Debug info */}
                            <details className="mt-4 text-sm">
                                <summary className="cursor-pointer font-semibold">Debug Info</summary>
                                <pre className="mt-2 bg-yellow-50 p-2 rounded overflow-auto text-xs text-left">
Analysis Status: {analysisStatus}
Resume ID: {id}
Logged in: {auth.isAuthenticated ? '✅ YES' : '❌ NO'}
User: {auth.user?.username || 'Not signed in'}
Auth user object: {auth.user ? 'Present' : 'Missing'}
                                </pre>
                                {!auth.isAuthenticated && (
                                    <div className="mt-2 text-red-600 font-bold">
                                        ⚠️ You are NOT signed in! Sign in now to analyze resumes.
                                    </div>
                                )}
                            </details>
                        </div>
                    ) : feedback && analysisStatus === 'completed' ? (
                        <div className="flex flex-col gap-8 animate-in fade-in duration-1000">
                            <Summary feedback={feedback} />
                            <ATS score={feedback.ATS.score || 0} suggestions={feedback.ATS.tips || []} />
                            <Details feedback={feedback} />
                        </div>
                    ) : analysisStatus === 'analyzing' ? (
                        <div>
                            <img src="/images/resume-scan-2.gif" className="w-full" />
                            <div className="text-center mt-4">
                                <p className="text-gray-600 text-lg">Analyzing your resume...</p>
                                <p className="text-gray-500 text-sm mt-2">This may take a minute. The page will update automatically.</p>
                                {/* Debug info */}
                                <details className="mt-4 text-sm">
                                    <summary className="cursor-pointer font-semibold text-gray-600">View Debug Info</summary>
                                    <pre className="mt-2 bg-gray-100 p-2 rounded overflow-auto text-xs text-left">
Status: {analysisStatus}
Checking every 3 seconds...
Resume ID: {id}
Logged in: {auth.isAuthenticated ? '✅ YES' : '❌ NO'}
User: {auth.user?.username || 'Not signed in'}
                                    </pre>
                                </details>
                            </div>
                        </div>
                    ) : isLoadingResume ? (
                        <div>
                            <img src="/images/resume-scan-2.gif" className="w-full" />
                            <p className="text-center mt-4 text-gray-600">Loading your resume analysis...</p>
                        </div>
                    ) : (
                        <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 my-4" role="alert">
                            <p className="font-bold">No Analysis Found</p>
                            <p>The resume analysis hasn't completed yet. Please wait a moment and refresh the page.</p>
                            <button 
                                onClick={() => window.location.reload()} 
                                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                                Refresh Page
                            </button>
                        </div>
                    )}
                </section>
            </div>
        </main>
    )
}
export default Resume
