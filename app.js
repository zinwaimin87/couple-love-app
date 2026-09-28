let mediaRecorder = null;
let voiceChunks = [];

async function toggleVoice() {
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    voiceChunks = [];

    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = function (e) {
      if (e.data.size > 0) {
        voiceChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = function () {
      const blob = new Blob(voiceChunks, {
        type: 'audio/webm'
      });

      const reader = new FileReader();

      reader.onload = function () {
        data.messages.push({
          text: '🎙️ Voice message',
          sender: currentSender(),
          time: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          }),
          kind: 'voice',
          media: reader.result
        });

        save();
        init();
      };

      reader.readAsDataURL(blob);

      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    };

    mediaRecorder.start();

    alert(
      '🎙️ Recording စတင်ပါပြီ။\n\nရပ်ချင်ရင် Voice ခလုတ်ကို ထပ်နှိပ်ပါ။'
    );

  } catch (e) {
    console.error(e);
    alert(
      'Microphone permission မရပါ။\n\nBrowser Settings မှာ Microphone ကို Allow လုပ်ပေးပါ။'
    );
  }
}
