import fs from "node:fs/promises";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import {
  createStudentService,
  getAllStudentsService,
  getStudentByIdService,
  updateStudentService,
  toggleStudentAcademicStatusService,
  regenerateStudentPinService
} from "./student.service.js";
import { importStudentsFromExcel } from "./student.import.js";
import { ApiError } from "../../utils/apiError.js";

export const createStudent = asyncHandler(async (req, res) => {
  const result = await createStudentService(req.body);

  return res.status(201).json(
    new ApiResponse(201, "Student created successfully. Share the generated PIN securely with the student.", result)
  );
});

export const getAllStudents = asyncHandler(async (req, res) => {
  const students = await getAllStudentsService();

  return res.status(200).json(
    new ApiResponse(200, "Students fetched successfully", students)
  );
});

export const getStudentById = asyncHandler(async (req, res) => {
  const student = await getStudentByIdService(req.params.studentId);

  return res.status(200).json(
    new ApiResponse(200, "Student fetched successfully", student)
  );
});

export const updateStudent = asyncHandler(async (req, res) => {
  const student = await updateStudentService(req.params.studentId, req.body);

  return res.status(200).json(
    new ApiResponse(200, "Student updated successfully", student)
  );
});

export const toggleStudentAcademicStatus = asyncHandler(async (req, res) => {
  const student = await toggleStudentAcademicStatusService(req.params.studentId);

  return res.status(200).json(
    new ApiResponse(
      200,
      `Student status changed to ${student.academicStatus}`,
      student
    )
  );
});

export const regenerateStudentPin = asyncHandler(async (req, res) => {
  const result = await regenerateStudentPinService(req.params.studentId);
  return res.status(200).json(
    new ApiResponse(200, "New student PIN generated. Share it securely; it will not be shown again.", result)
  );
});

export const importStudents = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Excel file is required");
  }

  try {
    const result = await importStudentsFromExcel(req.file.path);

    return res.status(200).json(
      new ApiResponse(200, "Student import completed", result)
    );
  } finally {
    try {
      await fs.unlink(req.file.path);
    } catch (error) {
      if (error.code !== "ENOENT") {
        // Cleanup failures should not hide the original import result/error.
      }
    }
  }
});

import xlsx from "xlsx";

export const downloadStudentImportTemplate = (_req, res) => {
  const templateData = [
    {
      registerNumber: "23CSE001",
      universityRegisterNo: "U23CSE001",
      fullName: "Arun Kumar",
      dob: "2006-05-14",
      gender: "MALE",
      mobileNo: "9876543210",
      email: "arun23cse@example.com",
      departmentCode: "CSE",
      programCode: "BE-CSE",
      regulationCode: "R2021",
      batchLabel: "2023-2027",
      currentSemesterNumber: 5,
      academicStatus: "ACTIVE",
      admissionYear: 2023
    }
  ];

  const worksheet = xlsx.utils.json_to_sheet(templateData);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Students");

  const buffer = xlsx.write(workbook, {
    type: "buffer",
    bookType: "xlsx"
  });

  res.setHeader(
    "Content-Disposition",
    'attachment; filename="student-import-template.xlsx"'
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  return res.send(buffer);
};