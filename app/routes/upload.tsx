import {type FormEvent, useState} from 'react'
import Navbar from "~/components/Navbar";
import FileUploader from "~/components/FileUploader";
import {usePuterStore} from "~/lib/puter";
import {useNavigate} from "react-router";
import {convertPdfToImage} from "~/lib/pdf2img";
import {generateUUID} from "~/lib/utils";
import {prepareInstructions} from "../../constants";

const Upload = () => {
    const { auth, isLoading, fs, ai, kv } = usePuterStore();
    const navigate = useNavigate();
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const handleFileSelect = (file: File | null) => {
        setFile(file)
    }

    const handleAnalyze = async ({ companyName, jobTitle, jobDescription, file }: { companyName: string, jobTitle: string, jobDescription: string, file: File  }) => {
        console.log('="=== Starting Resume Analysis ==="');
        console.log('Auth status:', auth);
        console.log('Is authenticated:', auth.isAuthenticated);
        console.log('User:', auth.user);
        
        if (!auth.isAuthenticated) {
            console.error('User not authenticated!');
            alert('❌ You must sign in first!\n\nClick the "Sign In" button in the top right corner to sign in with Puter.js');
            setStatusText('Please sign in first to analyze your resume');
            return;
        }

        if (!auth.user) {
            console.error('User data not available!');
            alert('❌ Sign-in incomplete!\n\nPlease refresh the page and sign in again.');
            setStatusText('Sign-in issue. Please refresh and try again.');
            return;
        }

        console.log('✅ Authentication confirmed. User:', auth.user.username);
        setIsProcessing(true);

        setStatusText('Uploading the file...');
        const uploadedFile = await fs.upload([file]);
        if(!uploadedFile) {
            console.error('Failed to upload file');
            setStatusText('Error: Failed to upload file');
            setIsProcessing(false);
            return;
        }

        setStatusText('Converting to image...');
        const imageFile = await convertPdfToImage(file);
        if(!imageFile.file) {
            console.error('Failed to convert PDF to image');
            setStatusText('Error: Failed to convert PDF to image');
            setIsProcessing(false);
            return;
        }

        setStatusText('Uploading the image...');
        const uploadedImage = await fs.upload([imageFile.file]);
        if(!uploadedImage) {
            console.error('Failed to upload image');
            setStatusText('Error: Failed to upload image');
            setIsProcessing(false);
            return;
        }

        setStatusText('Preparing data...');
        const uuid = generateUUID();
        const data = {
            id: uuid,
            resumePath: uploadedFile.path,
            imagePath: uploadedImage.path,
            companyName, jobTitle, jobDescription,
            feedback: null, // null indicates analysis in progress
            status: 'analyzing' // Add status field to track progress
        }
        await kv.set(`resume:${uuid}`, JSON.stringify(data));

        setStatusText('Analyzing...');

        try {
            console.log('="=== Calling AI Feedback ==="');
            console.log('Resume path (PDF):', uploadedFile.path);
            console.log('Image path (PNG):', uploadedImage.path);
            console.log('Using IMAGE for AI analysis');
            console.log('User sending request:', auth.user?.username);
            
            const feedback = await ai.feedback(
                uploadedImage.path,  // Use image instead of PDF
                prepareInstructions({ jobTitle, jobDescription })
            )
            
            console.log('Feedback returned:', !!feedback);
            
            if (!feedback) {
                console.error('❌ No feedback received from AI');
                console.error('Possible causes:');
                console.error('1. You are not signed in (check Logged in: in debug info)');
                console.error('2. Puter.js AI service is down');
                console.error('3. Network connection issue');
                console.error('4. Resume file is not in correct format');
                
                data.status = 'failed';
                data.feedback = { error: 'No response from AI - Please make sure you are signed in to Puter.js' };
                await kv.set(`resume:${uuid}`, JSON.stringify(data));
                setStatusText('Error: Failed to get AI response. Make sure you are signed in to Puter.js!');
                setIsProcessing(false);
                return;
            }

            console.log('="=== Raw AI Response ==="');
            console.log('Full feedback object:', JSON.stringify(feedback, null, 2));
            console.log('feedback.message:', feedback.message);
            console.log('feedback.message.content type:', typeof feedback.message?.content);
            console.log('feedback.message.content:', feedback.message?.content);
            
            // Log the entire structure to understand it better
            if (feedback.message?.content) {
                console.log('Content is array?', Array.isArray(feedback.message.content));
                if (Array.isArray(feedback.message.content)) {
                    console.log('Content array length:', feedback.message.content.length);
                    console.log('First element:', feedback.message.content[0]);
                }
            }

            let feedbackText = '';
            
            // Handle different response formats
            if (typeof feedback.message?.content === 'string') {
                feedbackText = feedback.message.content;
                console.log('Format: string content');
            } else if (Array.isArray(feedback.message?.content) && feedback.message.content.length > 0) {
                if (typeof feedback.message.content[0].text === 'string') {
                    feedbackText = feedback.message.content[0].text;
                    console.log('Format: array with text');
                } else if (typeof feedback.message.content[0] === 'string') {
                    feedbackText = feedback.message.content[0];
                    console.log('Format: array of strings');
                }
            } else {
                console.error('Unexpected feedback format');
                console.error('Expected string or array, got:', feedback.message);
                data.status = 'failed';
                data.feedback = { error: 'Invalid response format from AI' };
                await kv.set(`resume:${uuid}`, JSON.stringify(data));
                setStatusText('Error: Invalid response format from AI. Please try again.');
                setIsProcessing(false);
                return;
            }

            console.log('="=== Extracted Feedback Text ==="');
            console.log('Raw text:', feedbackText.substring(0, 200) + '...');

            // Remove markdown code blocks if present
            let cleanedText = feedbackText.trim();
            if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                console.log('Removed ```json markers');
            } else if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
                console.log('Removed ``` markers');
            }

            console.log('Cleaned text sample:', cleanedText.substring(0, 200) + '...');

            try {
                data.feedback = JSON.parse(cleanedText);
                data.status = 'completed';
                console.log('="=== Parsing Successful ==="');
                console.log('Parsed feedback:', data.feedback);
                console.log('Overall Score:', data.feedback.overallScore);
                console.log('ATS Score:', data.feedback.ATS?.score);
                console.log('Tone & Style Score:', data.feedback.toneAndStyle?.score);
                console.log('Content Score:', data.feedback.content?.score);
                console.log('Structure Score:', data.feedback.structure?.score);
                console.log('Skills Score:', data.feedback.skills?.score);
            } catch (parseError) {
                console.error('="=== JSON Parse Error ==="');
                console.error('Parse error:', parseError);
                console.error('Text that failed to parse:', cleanedText);
                console.error('Text length:', cleanedText.length);
                console.error('First 500 chars:', cleanedText.substring(0, 500));
                
                data.status = 'failed';
                data.feedback = { error: `Failed to parse AI response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`, rawResponse: cleanedText.substring(0, 1000) };
                await kv.set(`resume:${uuid}`, JSON.stringify(data));
                setStatusText('Error: Failed to parse AI response. The AI response was in an unexpected format.');
                setIsProcessing(false);
                return;
            }
            
            await kv.set(`resume:${uuid}`, JSON.stringify(data));
            console.log('="=== Data Saved Successfully ==="');
            console.log('Saved to database:', `resume:${uuid}`);
            setStatusText('Analysis complete, redirecting...');
            console.log('Final data:', data);
            navigate(`/resume/${uuid}`);
        } catch (error) {
            console.error('="=== Unexpected Error ==="');
            console.error('Error analyzing resume:', error);
            console.error('Error type:', error instanceof Error ? 'Error' : typeof error);
            console.error('Error message:', error instanceof Error ? error.message : String(error));
            
            // Better error inspection for plain objects
            if (error && typeof error === 'object') {
                console.error('Error object keys:', Object.keys(error));
                console.error('Full error object:', JSON.stringify(error, null, 2));
                if ('message' in error) console.error('error.message:', (error as any).message);
                if ('code' in error) console.error('error.code:', (error as any).code);
                if ('status' in error) console.error('error.status:', (error as any).status);
                if ('response' in error) console.error('error.response:', (error as any).response);
            }
            
            data.status = 'failed';
            const errorMsg = error instanceof Error 
                ? error.message 
                : (error && typeof error === 'object' && 'message' in error)
                ? (error as any).message
                : 'Unknown error occurred';
            data.feedback = { error: errorMsg };
            await kv.set(`resume:${uuid}`, JSON.stringify(data));
            setStatusText(`Error: ${errorMsg}`);
            setIsProcessing(false);
        }
    }

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget.closest('form');
        if(!form) return;
        const formData = new FormData(form);

        const companyName = formData.get('company-name') as string;
        const jobTitle = formData.get('job-title') as string;
        const jobDescription = formData.get('job-description') as string;

        if(!file) return;

        handleAnalyze({ companyName, jobTitle, jobDescription, file });
    }

    return (
        <main className="bg-[url('/images/bg-main.svg')] bg-cover">
            <Navbar />

            <section className="main-section">
                <div className="page-heading py-16">
                    <h1>Smart feedback for your dream job</h1>
                    {!auth.isAuthenticated && !isLoading && (
                        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-6 my-4" role="alert">
                            <p className="font-bold text-lg">🔴 Sign In Required</p>
                            <p className="mt-2">You must sign in with Puter.js before analyzing your resume.</p>
                            <button 
                                onClick={() => auth.signIn()}
                                className="mt-4 px-6 py-2 bg-red-500 text-white rounded hover:bg-red-600 font-bold"
                            >
                                Sign In Now
                            </button>
                        </div>
                    )}
                    {auth.isAuthenticated && !isLoading && (
                        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 my-4" role="status">
                            <p className="font-bold">✅ Signed in as {auth.user?.username || 'Puter user'}</p>
                            <p className="text-sm">Ready to analyze resumes</p>
                        </div>
                    )}
                    {isProcessing ? (
                        <>
                            <h2>{statusText}</h2>
                            <img src="/images/resume-scan.gif" className="w-full" />
                        </>
                    ) : (
                        <h2>Drop your resume for an ATS score and improvement tips</h2>
                    )}
                    {!isProcessing && (
                        <form id="upload-form" onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8">
                            <div className="form-div">
                                <label htmlFor="company-name">Company Name</label>
                                <input type="text" name="company-name" placeholder="Company Name" id="company-name" disabled={!auth.isAuthenticated} />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-title">Job Title</label>
                                <input type="text" name="job-title" placeholder="Job Title" id="job-title" disabled={!auth.isAuthenticated} />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-description">Job Description</label>
                                <textarea rows={5} name="job-description" placeholder="Job Description" id="job-description" disabled={!auth.isAuthenticated} />
                            </div>

                            <div className="form-div">
                                <label htmlFor="uploader">Upload Resume</label>
                                <FileUploader onFileSelect={handleFileSelect} />
                            </div>

                            <button 
                                className="primary-button" 
                                type="submit"
                                disabled={!auth.isAuthenticated || isLoading}
                                title={!auth.isAuthenticated ? 'Please sign in first' : 'Analyze Resume'}
                            >
                                {!auth.isAuthenticated ? '🔒 Sign in to Analyze' : 'Analyze Resume'}
                            </button>
                        </form>
                    )}
                </div>
            </section>
        </main>
    )
}
export default Upload
