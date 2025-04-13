// DOM Elements
const generationSection = document.getElementById('generation-section');
const previewSection = document.getElementById('preview-section');
const paidSection = document.getElementById('paid-section');
const videoText = document.getElementById('video-text');
const generateBtn = document.getElementById('generate-btn');
const cancelBtn = document.getElementById('cancel-btn');
const progressContainer = document.getElementById('progress-container');
const proceedToPayBtn = document.getElementById('proceed-to-pay');
const downloadBtn = document.getElementById('download-btn');
const videoPreview = document.getElementById('video-preview');
const paidVideoPreview = document.getElementById('paid-video-preview');

// State
let currentRequestId = null;
let currentGenerationAbortController = null;
let progressInterval = null;
let startTime = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Word count validation
  videoText.addEventListener('input', updateWordCount);
  
  // Button events
  generateBtn.addEventListener('click', generateVideo);
  cancelBtn.addEventListener('click', cancelGeneration);
  proceedToPayBtn.addEventListener('click', initiatePayment);
  downloadBtn.addEventListener('click', downloadPaidVideo);
  
  // Check for any existing request in URL hash
  checkUrlForRequestId();
});

// Check URL for request_id (for payment redirects)
function checkUrlForRequestId() {
  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get('request_id');
  
  if (requestId) {
    // Check if this is a payment verification
    const paymentId = urlParams.get('payment_id');
    const orderId = urlParams.get('order_id');
    const signature = urlParams.get('razorpay_signature');
    
    if (paymentId && orderId && signature) {
      verifyPaymentAfterRedirect(requestId, paymentId, orderId, signature);
    } else {
      // Just a normal request ID - check status
      checkExistingRequest(requestId);
    }
    
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Check status of existing request
async function checkExistingRequest(requestId) {
  try {
    const response = await fetch(`http://localhost:8000/request-status/${requestId}`);
    const data = await response.json();
    
    if (data.status === 'completed') {
      currentRequestId = requestId;
      showWatermarkedPreview(data.video_url);
    }
  } catch (error) {
    console.error('Error checking existing request:', error);
  }
}

// Update word count
function updateWordCount() {
  const text = videoText.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  document.getElementById('word-count').textContent = `${words} words`;
  
  // Validation
  if (words < 5 || words > 50) {
    document.getElementById('word-count').classList.add('text-red-400');
    generateBtn.disabled = true;
    generateBtn.classList.add('opacity-70', 'cursor-not-allowed');
  } else {
    document.getElementById('word-count').classList.remove('text-red-400');
    generateBtn.disabled = false;
    generateBtn.classList.remove('opacity-70', 'cursor-not-allowed');
  }
}

// Generate video
async function generateVideo() {
  const text = videoText.value.trim();
  
  if (!text) {
    showToast('Please enter some text', 'error');
    return;
  }

  try {
    // UI State
    startGenerationUI();
    startTime = Date.now();
    
    // API Call
    currentGenerationAbortController = new AbortController();
    const response = await fetch('http://localhost:8000/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: currentGenerationAbortController.signal
    });

    if (!response.ok) throw new Error('Failed to start generation');
    
    const data = await response.json();
    currentRequestId = data.request_id;
    
    // Directly show the video from the response
    if (data.video_url) {
      await showWatermarkedPreview(data.video_url);
      showToast('Video generated successfully!', 'success');
    } else {
      throw new Error('No video URL in response');
    }
    
  } catch (error) {
    if (error.name !== 'AbortError') {
      showToast(`Error: ${error.message}`, 'error');
    }
    resetGenerationUI();
  }
}



// Show watermarked preview
// Simplified showWatermarkedPreview function
async function showWatermarkedPreview(videoUrl) {
  try {
    if (!videoUrl) {
      throw new Error('No video URL provided');
    }

    // Construct proper URL
    let absoluteUrl;
    if (videoUrl.startsWith('http')) {
      absoluteUrl = videoUrl;
    } else {
      absoluteUrl = `http://localhost:8000${videoUrl.startsWith('/') ? '' : '/'}${videoUrl}`;
    }

    // Add cache busting
    absoluteUrl += `${absoluteUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
    
    // Set video source
    videoPreview.src = absoluteUrl;
    
    // Update status
    const statusElement = document.getElementById('simple-status');
    if (statusElement) {
      statusElement.textContent = 'Video ready!';
      statusElement.className = 'text-center py-4 text-green-500';
    }
    
    // Show preview
    previewSection.classList.remove('hidden');
    generationSection.classList.add('hidden');
    
    // Return a promise that resolves when video is loaded
    return new Promise((resolve) => {
      videoPreview.onloadeddata = () => {
        console.log('Video successfully loaded');
        resolve();
      };
      
      videoPreview.onerror = () => {
        console.error('Video load error');
        showToast('Failed to load video', 'error');
        resolve();
      };
      
      videoPreview.load();
    });
    
  } catch (error) {
    console.error('Video preview error:', error);
    showToast('Failed to load video preview', 'error');
    throw error;
  }
}


// Cancel generation
async function cancelGeneration() {
  if (currentRequestId) {
    try {
      await fetch(`http://localhost:8000/cancel-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: currentRequestId })
      });
    } catch (e) {
      console.error('Cancel error:', e);
    }
  }
  
  if (currentGenerationAbortController) {
    currentGenerationAbortController.abort();
  }
  
  resetGenerationUI();
  showToast('Generation cancelled', 'warning');
}

// UI Helpers
function startGenerationUI() {
  // Buttons
  document.getElementById('generate-text').textContent = 'Generating...';
  document.getElementById('generate-spinner').classList.remove('hidden');
  generateBtn.disabled = true;
  cancelBtn.classList.remove('hidden');

  // Show simple status message
  const statusElement = document.createElement('div');
  statusElement.id = 'simple-status';
  statusElement.className = 'text-center py-4 text-blue-500';
  statusElement.textContent = 'Generating your video...';
  progressContainer.innerHTML = '';
  progressContainer.appendChild(statusElement);
  progressContainer.classList.remove('hidden');
  
  videoText.disabled = true;
}

function resetGenerationUI() {
  // Buttons
  document.getElementById('generate-text').textContent = 'Generate Video';
  document.getElementById('generate-spinner').classList.add('hidden');
  generateBtn.disabled = false;
  cancelBtn.classList.add('hidden');
  
  // Inputs
  videoText.disabled = false;
  
  // Cleanup
  currentRequestId = null;
  currentGenerationAbortController = null;
  clearInterval(progressInterval);
}

// Payment Handling
async function initiatePayment() {
  if (!currentRequestId) {
    showToast('No video request found', 'error');
    return;
  }

  try {
    // Set loading state
    proceedToPayBtn.disabled = true;
    proceedToPayBtn.innerHTML = 'Preparing Payment...';

    // 1. Create order on backend
    const response = await fetch('http://localhost:8000/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 100, // ₹1 (100 paise)
        currency: 'INR',
        request_id: currentRequestId
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to create payment order');
    }
    
    const { order_id, razorpay_key, amount, currency } = await response.json();

    // 2. Configure Razorpay checkout
    const options = {
      key: razorpay_key,
      amount: amount.toString(),
      currency: currency,
      name: "ShortReels AI",
      description: "Watermark Removal",
      order_id: order_id,
      handler: async function(response) {
        // 3. Verify payment on backend
        const verificationResponse = await verifyPayment(response);
        if (verificationResponse.success) {
          showPaidVideo(verificationResponse.paid_video_url);
          showToast('Payment successful!', 'success');
        }
      },
      theme: {
        color: "#6366F1"
      },
      modal: {
        ondismiss: function() {
          showToast("Payment cancelled", "warning");
        }
      }
    };

    // 4. Open checkout
    const rzp = new Razorpay(options);
    rzp.open();
    
    rzp.on('payment.failed', function(response) {
      showToast(`Payment failed: ${response.error.description}`, 'error');
    });

  } catch (error) {
    showToast(`Payment error: ${error.message}`, 'error');
    console.error('Payment error:', error);
  } finally {
    proceedToPayBtn.disabled = false;
    proceedToPayBtn.innerHTML = 'Proceed to Payment (₹1 Test)';
  }
}

// Verify payment
async function verifyPayment(response) {
  try {
    const verificationResponse = await fetch('http://localhost:8000/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
        request_id: currentRequestId
      })
    });
    
    const data = await verificationResponse.json();
    
    if (data.success && data.paid_video_url) {
      const videoUrl = `http://localhost:8000${data.paid_video_url}`;
      showPaidVideo(videoUrl);
      return { success: true };
    }
    return { success: false, error: data.error || "Verification failed" };
  } catch (error) {
    console.error('Verification error:', error);
    return { success: false, error: error.message };
  }
}

// Verify payment after redirect (for mobile)
async function verifyPaymentAfterRedirect(requestId, paymentId, orderId, signature) {
  try {
    const response = await fetch('http://localhost:8000/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_id: paymentId,
        order_id: orderId,
        razorpay_signature: signature,
        request_id: requestId
      })
    });
    
    const data = await response.json();
    
    if (data.paid_video_url) {
      currentRequestId = requestId;
      showPaidVideo(data.paid_video_url);
      showToast('Payment successful! Video unlocked', 'success');
    } else {
      throw new Error('Payment verification failed');
    }
    
  } catch (error) {
    showToast(`Payment verification failed: ${error.message}`, 'error');
    console.error('Verification error:', error);
  }
}

// Show paid video
function showPaidVideo(videoUrl) {
  // Make sure URL is absolute
  const absoluteUrl = videoUrl.startsWith('http') ? 
    videoUrl : 
    `http://localhost:8000${videoUrl.startsWith('/') ? '' : '/'}${videoUrl}`;
  
  paidVideoPreview.src = absoluteUrl;
  paidVideoPreview.load();
  
  // Handle video errors
  paidVideoPreview.onerror = () => {
    console.error('Failed to load paid video', paidVideoPreview.error);
    showToast('Failed to load paid video', 'error');
  };
  
  // Show paid section
  paidSection.classList.remove('hidden');
  previewSection.classList.add('hidden');
}

// Download paid video
function downloadPaidVideo() {
  if (!paidVideoPreview.src) return;
  
  const a = document.createElement('a');
  a.href = paidVideoPreview.src;
  a.download = `shortreels-${currentRequestId}.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Toast notifications
function showToast(message, type = 'info') {
  const colors = {
    info: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500'
  };
  
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 ${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg animate__animated animate__fadeInUp`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('animate__fadeOutDown');
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}