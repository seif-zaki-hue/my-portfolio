from tkinter import *
from PIL import Image
root = Tk()
root.geometry("500x500+600+200")
def bmi():
    w=float(E1.get())
    h=float(E2.get())
    BMI=w/(h*h)
    if BMI < 16:
        result = 'You are seriously underweight'
    elif BMI < 18.5:
        result = 'You are underweight'
    elif BMI < 25:
        result = 'You are normal'
    elif BMI < 30:
        result = 'You are overweight'
    elif BMI < 35:
        result = 'You are obese'
    else:
        result = 'You are severely obese'
    LR.config(text=result)
def cls():
    E1.delete(0, 'end')
    E2.delete(0, 'end')
    LR.config(text='')
img = Image.open("BMI.png")
img_resized = img.resize((200, 200))
img_resized.save("New_BMI.png", "PNG")
image=PhotoImage(file='New_BMI.png')
L_IMAGE=Label(root,image=image)
L_IMAGE.pack()
L1=Label(root,text="Enter your Weight in KG")
L1.pack()
E1=Entry(root)
E1.pack()
L2=Label(root,text="Enter your Height in M")
L2.pack()
E2=Entry(root)
E2.pack()
B1=Button(root,text="Calculate",command=bmi)
B1.pack()
B2=Button(root,text="Clear",command=cls)
B2.pack()
LR=Label(root,text='')
LR.pack()
root.mainloop()
