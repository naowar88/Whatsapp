// دالة لجلب الخيارات الحالية من السيرفر
async function fetchOptions() {
    const response = await fetch('/options');
    const data = await response.json();
    return data.options;
}

// دالة لعرض الخيارات في الواجهة
async function renderOptions() {
    const options = await fetchOptions();
    const optionsList = document.getElementById('options-list');
    optionsList.innerHTML = '';

    options.forEach(option => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'option';
        optionDiv.innerHTML = `
            <span>${option.id} - ${option.label}</span>
            <button onclick="deleteOption('${option.id}')">حذف</button>
        `;
        optionsList.appendChild(optionDiv);
    });
}

// دالة لحذف خيار
async function deleteOption(id) {
    const response = await fetch(`/options/${id}`, {
        method: 'DELETE'
    });
    if (response.ok) {
        alert('تم حذف الخيار بنجاح');
        renderOptions();
    } else {
        alert('حدث خطأ أثناء حذف الخيار');
    }
}

// دالة لإضافة خيار جديد
async function addOption() {
    const id = document.getElementById('option-id').value;
    const label = document.getElementById('option-label').value;
    const response = document.getElementById('option-response').value;

    const newOption = {
        id,
        label,
        response
    };

    const result = await fetch('/options', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(newOption)
    });

    if (result.ok) {
        alert('تم إضافة الخيار بنجاح');
        document.getElementById('option-id').value = '';
        document.getElementById('option-label').value = '';
        document.getElementById('option-response').value = '';
        renderOptions();
    } else {
        alert('حدث خطأ أثناء إضافة الخيار');
    }
}

// عرض الخيارات عند تحميل الصفحة
window.onload = renderOptions;